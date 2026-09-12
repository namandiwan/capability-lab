# Computer-Use Automation System

Status: the implementation includes a genuine free local-model discovery run and deterministic replays of its saved artifact. This report identifies design-only extensions explicitly.

## Architecture

The model proposes; policy authorizes; the surface acts; the runtime verifies. TypeScript and Zod provide compile-time types and runtime validation. A single Node.js process owns an isolated Playwright browser context. The local LedgerDesk proxy presents member search, record detail, account preparation and review through an iframe and table-based forms. Automation uses the UI, never a banking data endpoint.

`Planner` accepts a goal, public observation and executed history. It returns one structured action, finish or escalation. The default Ollama adapter runs Qwen3 4B locally with schema-constrained output, thinking disabled and temperature zero. An optional OpenAI adapter uses structured output and `store: false`. Both record limited model metadata without model prose. `Runtime` executes and checks actions before recording them. Replay depends on the saved artifact and surface, with no provider import or model decisions. The included genuine run made eight local-model decisions; test-double runs remain clearly labeled.

The trusted vendor binding defines control vocabulary and state recognition, not step order. This curated scope reduces discovery flexibility but makes targeting, policy and privacy reviewable. A single process keeps ownership understandable; queues and distributed workers are unnecessary for this slice.

## Artifact schema

A capability carries schema/capability versions, application family and binding version, input/output contract identifiers, ordered actions with before/after states, output targets, terminal checkpoint and provenance. Inputs are member ID and nickname; fills reference input names rather than recording values. Outputs are savings balance, product and review readiness. The exported contracts and source schemas define their types.

Logical targets resolve to exact accessible role/name pairs within a named iframe. Match ambiguity fails rather than selecting an arbitrary element. There is no arbitrary JavaScript, selector generation or executable model transcript in an artifact. This makes the artifact and its binding jointly reviewable, although the artifact is not self-contained without its contracts/binding. Runtime validation rejects unknown versions, extra fields, broken state continuity and missing terminal checkpoints. Every action is policy-checked before replay begins. Provenance is descriptive metadata, not signed proof of origin.

## Determinism & error handling

Replay fixes action order, bindings, parameter substitution and recovery policy. Latency and business data can vary; deterministic decisions do not promise identical outputs across changing records. Fills and selections verify the values applied. Transitions and final extraction check states and output types.

The result union separates success, expected business outcomes (`not_found`, `validation`, `permission_denied`) and hard failures. Permission denial does not invite a bypass. Slow/unknown transitional states use bounded polling; a known notice has one permitted dismissal. Session expiry requests intervention. Unknown states after the wait budget, application errors, ambiguous controls and unexpected dialogs stop or escalate. Uncertain actions are not blindly retried. A production write timeout would require reconciliation before another dispatch; this capability never commits an account.

Step, run, wait, model-call and intervention budgets limit execution. An in-flight browser operation can extend the overall wall time by its own bounded timeout. Exceptions expose safe codes rather than raw messages, reducing diagnostic detail. Five local repeat successes are useful regression evidence, not a reliability estimate for production.

## Heterogeneity & multi-tenant

`Surface.observe/act/read` separates flow execution from browser mechanics. A desktop adapter could resolve logical controls with platform accessibility APIs; legacy web bindings could add reviewed frame paths and text anchors. An inaccessible visual surface would need image anchors, viewport/DPI contracts, confidence thresholds and ambiguity handling. None of those adapters is implemented; the current surface still relies on meaningful accessible labels.

For institutions sharing a vendor, retain a base capability and separately version each tenant's binding: origin, frame/control aliases, locale, permissions and compatibility revision. Pin both revisions per invocation; overrides must not widen policy implicitly. Smoke tests and canary replays detect incompatible checkpoints. Quarantine a failing binding rather than silently rewriting production automation with a model. Semantic workflow changes require a new capability version. Tenant-scoped storage, isolated workers, credentials and durable leases belong in deployment design; they are not built here.

## Escalation & handoff

An intervention carries session identifier, step, expected/observed state and reason. Ownership moves from automation to operator with an incrementing epoch, invalidating old automated leases. The runner awaits the operator callback. The headed CLI exposes the same live browser; an operator restores the session and types `resume`. The runtime revalidates state before proceeding. A bad resume fails. Page listeners record action type and recognized control identity, excluding entered values.

The integration harness simulates restoration in the identical browser/page and checks logged actions and control transfers. This proves the control-transfer mechanism, not that a human personally performed the evidence run. The terminal is a minimal local operator surface, not authenticated remote co-browsing. It should expose capability identity and richer context more clearly before submission. Physical browser access is not fenced, and page listeners are not tamper-proof auditing. Production needs authenticated acquisition, transport-level input fencing and a durable lease.

## Safety

Trusted deployment policy fixes the entry origin, permitted routes and action/target combinations. Browser request interception rejects off-policy requests; service workers/WebSockets are blocked and popups/downloads flagged. Risky account creation is absent from automation permissions even though its button is visible. A model cannot authorize its own action. Configuration is trusted; this is not a complete containment system for arbitrary hostile sites.

Normal evidence stores only approved action/state metadata, redacted results and a semantic failure snapshot. Inputs, financial values, raw DOM, screenshots and model prose are not persisted. Outputs are returned to the caller, who must protect downstream storage. The model receives public control/state names; a user-written goal can still contain sensitive text and should use parameter references. Provider `store: false` is not a claim of zero retention or regulatory compliance. The small failure snapshot favors privacy over rich diagnostics; unexpected screens may need a stronger reviewed, redacted capture mechanism.

## Cuts

One curated linear capability, one browser surface, no real banking access, no desktop/OCR implementation, no tenant infrastructure, no remote operator authentication, no signed artifact admission, and no autonomous repair. Goal completion currently verifies review and output types; it does not independently prove every semantic detail of arbitrary natural-language intent. More task-specific invariants are a next step.

A function-style catalog, registry-backed dispatch by capability name, and repeated-replay report are small extras. The registry is intentionally local and static rather than a network service. Next engineering priorities are stronger business postconditions, reviewed artifact admission, coherent observation snapshots and an authenticated operator transport. Breadth is deliberately subordinate to trustworthy execution boundaries.
