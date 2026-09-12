# Evidence provenance

## Present

`discovery-1789097619829/` is a successful genuine LLM-driven run against the live local surface. Its artifact records `provenance.kind: llm-discovery` and model `ollama/qwen3:4b`; its log contains eight model decisions and the actual policy-checked UI actions. `replay-1789097750889/` replays that exact artifact successfully with member `10002` and reports a `not_found` business outcome for `99999`; both have `modelCalls: 0`. `latest-discovery.json` and `latest-replay.json` link the pair.

`offline/capability.json` is a **hand-authored test fixture** (`provenance.kind: test-fixture`, model `none`). Its flows ran against the actual local browser UI. `offline/summary.json` records normal/changed-input success, known business outcomes, bounded recovery, simulated operator handoff, an expected application-error stop, and five successful repeat replays. Replay model calls are zero.

The existing offline directories contain two generations of events from repeated executions. Events have distinct run IDs; `result.json` describes the latest run. Some older failure snapshots remain beside newer success results. These are historical development evidence, not a clean final submission bundle. Do not infer a latest-run failure from an unmatched old snapshot.

Use a fresh output directory for every run. Do not relabel a fixture as genuine discovery or delete failed attempts to claim unbroken success.

## Historical attempts

Earlier timestamped discovery directories are retained to show honest iteration: an unsupported cloud-provider schema, exhausted cloud credits, a local timeout, a repeated-action validation outcome, and a policy-blocked risky action. They are not presented as successes. The successful run followed two generic planner fixes: do not repeat successful history and recognize the explicit review stop condition.

Normal result files redact outputs. The caller receives typed output values in memory/stdout. Failure JSON files are allowlisted semantic projections, not full screenshots or DOM dumps. No raw sensitive data should enter the public repository.

## Live provider attempts

`discovery-1789096404412/` records a rejected request (HTTP 400). The unsupported `oneOf` decision schema was corrected to `anyOf` and a regression test was added. `discovery-1789096482576/` records the next rejected request (HTTP 429). A sanitized provider diagnostic confirmed `insufficient_quota` / `credit_balance_exhausted`. Neither attempt performed an AI-directed UI action or produced a successful discovered capability. The API key is configured, but API credits are required.
