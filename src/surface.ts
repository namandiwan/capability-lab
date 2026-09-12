import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
import type { Action, Inputs, Observation, TargetId, State } from './schema.js';
import { controls, stateNames, Policy, RuntimeFault } from './profile.js';
import type { Audit } from './audit.js';

export interface Surface {
  readonly sessionId: string;
  observe(): Promise<Observation>;
  act(action: Action, inputs: Inputs): Promise<void>;
  read(target: 'balance' | 'reviewStatus' | 'reviewProduct'): Promise<string>;
  beginHuman(audit: Audit, epoch: number): Promise<void>;
  endHuman(): Promise<void>;
  close(): Promise<void>;
}
export class BrowserSurface implements Surface {
  readonly sessionId = crypto.randomUUID();
  private violation = false;
  private dialog = false;
  private human: { audit: Audit; epoch: number } | undefined;
  private pendingEvents: Promise<void>[] = [];
  private constructor(readonly browser: Browser, readonly context: BrowserContext,
    readonly page: Page, readonly policy: Policy) {}
  static async open(entry: string, options: { headed?: boolean; scenario?: string; timeoutMs?: number; policy?: Policy } = {}) {
    const policy = options.policy ?? new Policy(entry);
    if (!policy.permitsURL(entry)) throw new RuntimeFault('policy_denied');
    const browser = await chromium.launch({ headless: !options.headed,
      ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
        acceptDownloads: false });
      context.setDefaultTimeout(options.timeoutMs ?? 2500);
      const page = await context.newPage();
      const surface = new BrowserSurface(browser, context, page, policy);
      // Block off-allowlist requests before network dispatch, including redirects, frames and subresources.
      await context.route('**/*', async route => {
        if (!policy.permitsURL(route.request().url())) { surface.violation = true; await route.abort('blockedbyclient'); }
        else await route.continue();
      });
      await context.routeWebSocket(/.*/, socket => { surface.violation = true; socket.close(); });
      context.on('page', popup => { if (popup !== page) { surface.violation = true; void popup.close(); } });
      page.on('dialog', dialog => { surface.dialog = true; void dialog.dismiss(); });
      page.on('download', download => { surface.violation = true; void download.cancel(); });
      // Synthetic sandbox configuration only; not an application data/API channel.
      if (options.scenario) await context.addCookies([{ name: 'scenario', value: options.scenario, url: entry }]);
      await context.exposeBinding('__recordOperator', async (_source, raw: unknown) => {
        if (!surface.human || typeof raw !== 'object' || !raw) return;
        const { kind, name } = raw as { kind?: string; name?: string };
        const target = Object.entries(controls).find(([, c]) => c.name === name)?.[0];
        const safeKind = ['click', 'input', 'change', 'keydown'].includes(kind ?? '') ? kind : 'other';
        const pending = surface.human.audit.event('human_action', { kind: safeKind, target: target ?? 'unmapped',
          owner: 'operator', epoch: surface.human.epoch });
        surface.pendingEvents.push(pending);
        await pending;
      });
      await context.addInitScript(() => {
        for (const kind of ['click', 'input', 'change', 'keydown']) {
          document.addEventListener(kind, e => {
            const target = e.target as HTMLElement;
            const el = target.closest('button,input,select') as HTMLInputElement | null;
            if (!el) return;
            const name = el.getAttribute('aria-label') || el.labels?.[0]?.textContent ||
              (el.tagName === 'BUTTON' ? el.textContent : '');
            void (window as unknown as { __recordOperator: (e: unknown) => Promise<void> }).__recordOperator({ kind, name });
          }, true);
        }
      });
      await page.goto(entry, { waitUntil: 'load' });
      return surface;
    } catch (error) { await browser.close(); throw error; }
  }
  private frame() { return this.page.frameLocator('iframe[title="LedgerDesk workspace"]'); }
  locator(target: TargetId): Locator {
    const c = controls[target];
    return this.frame().getByRole(c.role, { name: c.name, exact: true });
  }
  private checkLocation() {
    if (this.violation || !this.policy.permitsURL(this.page.url()) || this.page.frames().some(f =>
      f.url() !== 'about:blank' && !this.policy.permitsURL(f.url()))) throw new RuntimeFault('navigation_blocked');
    if (this.dialog) throw new RuntimeFault('unexpected_dialog');
  }
  async observe(): Promise<Observation> {
    this.checkLocation();
    const present: State[] = [];
    for (const [state, name] of Object.entries(stateNames)) {
      const loc = this.frame().getByRole('heading', { name, exact: true });
      if (await loc.count() > 1) throw new RuntimeFault('ambiguous_state');
      if (await loc.isVisible()) present.push(state as State);
    }
    if (present.length > 1) throw new RuntimeFault('ambiguous_state');
    const visible: TargetId[] = [];
    for (const target of Object.keys(controls) as TargetId[]) {
      const loc = this.locator(target);
      if (await loc.count() > 1) throw new RuntimeFault('ambiguous_target');
      if (await loc.isVisible()) visible.push(target);
    }
    return { state: present[0] ?? 'unknown', visible };
  }
  async act(action: Action, inputs: Inputs) {
    this.checkLocation();
    this.policy.checkAction(action);
    const loc = this.locator(action.target);
    if (await loc.count() !== 1) throw new RuntimeFault('target_not_unique');
    if (action.kind === 'click') await loc.click();
    else if (action.kind === 'fill') {
      await loc.fill(inputs[action.input]);
      if (await loc.inputValue() !== inputs[action.input]) throw new RuntimeFault('input_verification_failed');
    } else {
      await loc.selectOption({ label: action.value });
      if ((await loc.locator('option:checked').innerText()).trim() !== action.value) throw new RuntimeFault('selection_verification_failed');
    }
    this.checkLocation();
  }
  async read(target: 'balance' | 'reviewStatus' | 'reviewProduct') {
    this.checkLocation();
    const loc = this.locator(target);
    if (await loc.count() !== 1) throw new RuntimeFault('output_not_unique');
    return (await loc.innerText()).trim();
  }
  async beginHuman(audit: Audit, epoch: number) { this.human = { audit, epoch }; await this.page.bringToFront(); }
  async endHuman() { this.human = undefined; await Promise.all(this.pendingEvents); this.pendingEvents = []; }
  async close() { await this.browser.close(); }
}
