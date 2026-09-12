import type { Action, TargetId, State } from './schema.js';

// Trusted deployment binding, separate from the learned flow. No step order lives here.
export const controls: Record<TargetId, { role: 'textbox' | 'button' | 'combobox' | 'status'; name: string; purpose: string }> = {
  memberId: { role: 'textbox', name: 'Member number', purpose: 'Member lookup input' },
  search: { role: 'button', name: 'Find member', purpose: 'Search for the supplied member' },
  openMember: { role: 'button', name: 'Open member', purpose: 'Open the matching member record' },
  prepareAccount: { role: 'button', name: 'Prepare sub-account', purpose: 'Start a reversible account draft' },
  product: { role: 'combobox', name: 'Account product', purpose: 'Select Savings or Checking' },
  nickname: { role: 'textbox', name: 'Account nickname', purpose: 'Name the draft using the nickname input' },
  review: { role: 'button', name: 'Review draft', purpose: 'Validate draft and reach review; no account created' },
  balance: { role: 'status', name: 'Savings balance', purpose: 'Read current savings balance' },
  reviewStatus: { role: 'status', name: 'Review status', purpose: 'Read review readiness' },
  reviewProduct: { role: 'status', name: 'Review product', purpose: 'Read selected product' },
  continue: { role: 'button', name: 'Continue session', purpose: 'Dismiss known maintenance notice' },
  signIn: { role: 'button', name: 'Restore session', purpose: 'Operator-only session restoration' },
  commit: { role: 'button', name: 'Create account', purpose: 'Irreversible account creation: prohibited' },
};
export const stateNames: Record<Exclude<State, 'unknown'>, string> = {
  search: 'Member search', results: 'Search results', detail: 'Member overview', form: 'Sub-account draft',
  review: 'Review ready', not_found: 'Member not found', validation: 'Validation error',
  permission_denied: 'Permission denied', session_expired: 'Session expired',
  interstitial: 'Maintenance notice', app_error: 'Service unavailable', loading: 'Loading',
};
export const allowedActions: Action[] = [
  { kind: 'fill', target: 'memberId', input: 'memberId' }, { kind: 'click', target: 'search' },
  { kind: 'click', target: 'openMember' }, { kind: 'click', target: 'prepareAccount' },
  { kind: 'fill', target: 'nickname', input: 'nickname' },
  { kind: 'select', target: 'product', value: 'Savings' }, { kind: 'select', target: 'product', value: 'Checking' },
  { kind: 'click', target: 'review' }, { kind: 'click', target: 'continue' },
];
export class RuntimeFault extends Error {
  constructor(public code: string) { super(code); }
}
export class Policy {
  readonly origin: string;
  constructor(entry: string, readonly actions: Action[] = allowedActions) {
    const url = new URL(entry);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol))
      throw new RuntimeFault('invalid_entry');
    this.origin = url.origin;
  }
  permitsURL(raw: string): boolean {
    try {
      const u = new URL(raw);
      return u.origin === this.origin && !u.username && !u.password && !u.search && !u.hash &&
        ['/', '/workspace', '/style.css', '/app.js'].includes(u.pathname);
    } catch { return false; }
  }
  checkAction(action: Action) {
    if (!this.actions.some(a => JSON.stringify(a) === JSON.stringify(action))) throw new RuntimeFault('policy_denied');
  }
}
