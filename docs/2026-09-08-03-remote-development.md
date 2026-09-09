# Remote development without manual coordination

Status: paused. Taken over and committed on 2026-09-09 (the takeover record
below): `ops tunnel`, `ops tunnel status` and `ops tunnel -- --run` work
without the identity plugin, `ops remote status|stop` work, and `ops remote`
startup refuses with its reason until the plugin is back in the dev
configuration and verified in isolation. Remote startup is not verified or
ready for use.

## Takeover record — 2026-09-09

The Product Owner asked for the uncommitted files to be taken over and
committed. What changed to make that honest:

- `bun run ops tunnel -- --run` works again without the identity plugin: the
  dev server's health check is the readiness test, the hostname is open while
  the connector runs — as it always was before the gate existed — and an
  already-active connector is left alone, because without identity it cannot
  be told apart from ours. With the plugin present the gated path is
  unchanged.
- `src/web/vite.config.ts` allows the tunnel hostname (`TUNNEL_HOSTNAME`);
  without that, Vite answers the tunnel with 403 "Blocked request", which is
  what the original command had run into since the dev server became plain
  Vite. This is the one shared-configuration change, and it is static.
- `bun run ops remote` (startup) refuses with a reason while the plugin is not
  in the dev configuration — read off the source, so a started app is never
  waited on for an identity it cannot give. `status` and `stop` work.
- `tests/unit/remote-cli.test.ts` copies `scripts/lib/bun-pin.ts`, which
  prepare.ts now imports; the five unit files are green.
- Not done: the remote walkthrough (step 4). No tunnel was started and nothing
  was exposed; the Cloudflare inspection was run read-only. The review
  blockers below stand.

## Shared localhost incident and handoff

The implementation added a remote identity/access plugin to the normal Vite
configuration while other agents and the developer were using port 8787. The
developer reported disruption. Both additions to `src/web/vite.config.ts` were
removed; its diff is now empty. A read-only process check confirms a Node process
still listens on 8787; this does not establish that the GUI works end to end.
No existing server was killed or replaced during recovery.

The new remote CLI modules and tests remain unfinished work. They depend on the
removed plugin, so passing isolated tests does not make remote startup usable.
Do not enable them on the shared server. Revise the design to preserve ordinary
development and verify integration in an isolated instance before touching shared
runtime configuration. Both the VS Code tunnel and Cloudflare app tunnel remain
required.

Live tunnel startup was not executed: automatic approval review rejected opening
the external tunnels without approval of the concrete startup and destination.
An existing Cloudflare connector belongs to the existing environment.

Verification before the rollback: 893 unit/repository tests passed before the
latest access-gate changes; a later isolated Vite access-gate test passed. The
full check did not complete. An isolated end-to-end run had 36 passes, 3 failures
(admin sign-in, team roster navigation, organization navigation), and 10 tests
not run. These occurred during concurrent GUI changes; their cause is unresolved.
Do not treat these results as validation of the final working tree.

## Review blockers before resuming

Read-only source review after the rollback found these remaining issues:

- Both `ops remote` and the rewritten `ops tunnel --run` depend on the removed
  identity/access middleware. Restoring the Vite configuration did not restore
  compatibility of the existing tunnel command. Resolve that regression before
  documenting either startup path as usable.
- The CLI still advertises remote startup without describing its unfinished
  state. The documentation warning alone does not prevent accidental use.
- The original lifecycle proposal below describes lock files and runtime
  records, but the implementation uses a loopback control listener on port 8789.
  Reconcile the design and acceptance checks with the chosen mechanism.
- The initial findings below describe the original tunnel script and dispatcher,
  not their current modified implementations. Treat them as historical context.
- Establish a safe integration design and an isolated verification workflow
  before resuming. A separate test port alone does not isolate edits to the Vite
  configuration watched by the shared server. Normal dev configuration, running
  processes and development data must remain undisturbed during verification.

This review did not run startup, tests, or change application/runtime code.

## Intended outcome

A developer runs one command on their development computer, then opens the
editor, agents and app from another device. The command checks what is already
running, starts what is missing, and reports what is actually reachable.

Use the existing automation dispatcher. Proposed commands:

| Command | Behavior |
| --- | --- |
| `bun run ops remote` | Prepare as needed, start or reuse the app and both tunnels, print links, and supervise processes started by this command. |
| `bun run ops remote status` | Report current state without installing, starting, provisioning or changing anything. |
| `bun run ops remote stop` | Stop only resources owned by this project's remote session. |

The normal path is the first command. Status and stop are for inspection and
cleanup, not extra steps required to make startup work. Ordinary `bun run dev`
and local tests keep their existing behavior.

## What we found

- The installed VS Code CLI supports tunnel status, login, startup, restart,
  shutdown and a preview background-service facility.
- A read-only check on 2026-09-08 returned
  `{"tunnel":null,"service_installed":false}` and `not logged in`.
  This describes that CLI's state at that time, not every VS Code installation
  or an independent remote connectivity check. The CLI also emitted a macOS
  diagnostic; do not confuse stderr noise with the structured result.
- Status can exit successfully while the tunnel is absent. Parse the JSON;
  exit code zero does not mean connected.
- [scripts/ops/tunnel.ts](../scripts/ops/tunnel.ts) manages the Cloudflare app
  tunnel. It currently performs provisioning, writes ingress configuration and
  stores a token even when the caller only wants to run the connector. There
  is no read-only status action.
- [scripts/ops.ts](../scripts/ops.ts) installs dependencies before dispatching
  ordinary operations. The new status/help paths must bypass that write.
- Browser tests already reserve 8788 and separate storage. Interactive dev uses
  8787. Remote access must preserve this separation.

The automation debt is manual coordination of the app, editor tunnel and app
tunnel, plus no reliable combined status. This plan addresses that debt without
reopening the stopped general CLI redesign.

## Implementation order

### 1. Establish a read-only status contract

Add the remote operation and a small orchestration module. Keep subprocess and
network boundaries injectable so failure paths can be tested without real accounts.
Use argument arrays, bounded waits and the existing Cloudflare API/credential
helpers. Do not introduce a second credentials system.

Report each component separately:

| Component | Evidence |
| --- | --- |
| Tools and credentials | CLI available, selected VS Code release, provider login available, Cloudflare access available. Never print credentials. |
| App | Health response on 8787 and evidence that it is this checkout's app. An unrelated occupied port is an error. |
| Editor tunnel | Structured VS Code status: absent, connecting, connected, error or unknown; distinguish service installation from connection. |
| App tunnel | Connector/configuration state from Cloudflare and an HTTPS app-health check. Tunnel existence alone is insufficient. |
| Browser access | Separate verification of authenticated editor/agent access and app sign-in/live reload; not implied by a health response. |

Expose readable output and `status --json` with a stable schema. Define exit
codes for ready, not ready, and inspection failure. Unknown must never become
ready. Network or permission errors need a concrete reason and next action.

Select the installed stable VS Code CLI by default. If only Insiders is present,
use it and report that choice. Read the matching state; do not merge different
installations or read VS Code's private token files. Verify the installed CLI
capabilities instead of assuming the latest website matches the machine.

### 2. Make startup linear and repeatable

1. Check tools, account access and current resources before making changes.
   Reuse the repository's setup implementation for preparation. Do not rerun
   migrations against an app someone is using; if preparation requires stopping
   that app, report the conflict instead of restarting it silently.
2. Guide first-time VS Code sign-in and license acceptance through its supported
   flow, then continue the same command. In a noninteractive agent terminal,
   report the required user action and remain safely resumable. Do not auto-accept
   legal terms or repeat a completed sign-in.
3. Reuse a healthy app on 8787. Otherwise start it through `bun run dev` and wait
   for readiness. Preserve the normal Vite flags and the e2e mode.
4. Reuse an existing editor tunnel. Otherwise start the supported VS Code tunnel
   command and wait for connected status, with timeout and cancellation handling.
5. Reuse or start the Cloudflare app tunnel using the refactored shared tunnel
   implementation. Provision only missing resources; update only configuration
   that actually differs and belongs to this environment.
6. Check the app through HTTPS, then print the editor URL, Agents URL and app URL
   together. Report which services were reused and which this command owns.

The Cloudflare hostname is shared across machines. A second connector can route
traffic to another checkout. Inspect active connectors before joining: if the
hostname belongs to another running development host, explain the conflict and
leave its DNS/configuration alone. Do not call a generic successful health check
proof that the public URL reaches this host; establish host/run identity through
a development-only mechanism and cover it with a check.

Refactor the current tunnel script so provisioning, status and connector startup
are separate internal operations. Keep the documented `ops tunnel --run` entry
point working through the same implementation. Remove its stale message claiming
that ordinary `bun run dev` starts the tunnel.

### 3. Own lifecycle and recovery

Initially keep `ops remote` attached on the host, supervising only the children
it starts. Closing the remote browser should not stop those host processes.
Explain that quitting the host command or sleeping/shutting down the host affects
availability. This first version does not promise unattended restart after reboot.

Use a project-local lock and minimal ignored runtime records. Record ownership and
process identity, never tokens. Concurrent invocations must attach/report existing
state instead of creating duplicate connectors. Handle stale records and PID reuse.
Ctrl-C, failed startup and `remote stop` must release owned processes without
killing the user's dev server, a pre-existing editor tunnel, or another project's
service. Avoid machine-wide kill/restart commands for resources we do not own.

VS Code's `tunnel service install` is available, but only persists the editor
tunnel. Defer a persistent mode until the whole app/editor/Cloudflare lifecycle,
platform support and uninstall behavior are designed and verified. Do not install
a machine-wide background service as a hidden side effect of ordinary startup.

### 4. Verify, then simplify the README

Add focused unit/repository checks for:

- Status/help with missing dependencies or credentials perform no writes.
- Null, disconnected, malformed and timed-out CLI responses are not ready.
- First-time login, cancelled login, supported release selection and redacted errors.
- Healthy-resource reuse, occupied ports, host mismatch and conflicting connectors.
- Concurrent startup, partial failure, stale records and cleanup ownership.
- Existing `dev`, e2e and `ops tunnel --run` command behavior remains compatible.

Run the documented project checks and local browser suite. Then perform a real
remote walkthrough through the new command: first-time setup, repeat startup,
open the editor, run a terminal command, start an agent, open/sign into the app,
observe a source edit, reconnect, and stop. Run local tests while the user browses
8787 and confirm their data stays isolated. Test both an owned dev server and one
already running before the command starts.

Record the platform, VS Code version, commands, results and remaining limitations
in this document. Start with the existing macOS development host. Do not claim
fresh Linux/Windows host support until setup and lifecycle checks pass there.

Replace the README's manual tunnel sequence with the single command only after
the walkthrough passes. Keep a short explanation of the three links and shared
checkout behavior. Native VS Code app-port forwarding remains a separate
compatibility investigation; it must pass authentication and live-reload checks
before replacing the current Cloudflare route.

## Done when

A developer can start remote work with one command, see evidence of readiness,
and reuse it without duplicates or damage to another session. Failure and cleanup
paths are tested. Remote editor, agents and app access have been demonstrated,
and the README describes the verified workflow. No manual coordination of three
terminals, hidden preparation commands or undocumented environment overrides is
needed.

## Sources and scope

Checked 2026-09-08 against installed CLI help and Microsoft's
[Remote Tunnels guide](https://code.visualstudio.com/docs/remote/tunnels),
[remote agents guide](https://code.visualstudio.com/docs/agents/run/remote-agent-sessions)
and [CLI implementation](https://github.com/microsoft/vscode/blob/main/cli/src/commands/tunnels.rs).
Agent UI is currently preview; recheck its URL and provider requirements when
implementing. Planning did not start tunnels, install services or change accounts.
