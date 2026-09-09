# Remy Sport

Basketball events, teams and live scoring for Thailand.

[Project status and plans](docs/README.md) · [Contributor instructions](AGENTS.md)

## Start the app

After cloning, install the project's tools and set up the local environment:

```sh
mise install
bun run setup
```

Then start the app:

```sh
bun run dev
```

Open **http://localhost:8787**. If someone already started it, just open the URL.
Only one dev server needs to run on the machine.

## Work remotely in VS Code

**Use your browser to connect to the computer where Remy Sport already runs.**
That computer runs Bun, the app, tests and agents. Your laptop or tablet only
needs a browser. Opening the GitHub repo in plain `vscode.dev` gives you an
editor, but no terminal to run this project. [VS Code web guide](https://code.visualstudio.com/docs/remote/vscode-web).

### Connect to your development computer

1. On that computer, open this repo in VS Code. Complete [Start the app](#start-the-app)
   there if it has not been set up yet.
2. Open the Command Palette and choose **Remote Tunnels: Turn on Remote Tunnel
   Access...**. Sign in with GitHub and follow the prompts.
3. On your other device, open the `vscode.dev` link VS Code provides. Sign in
   with the same account and open the `remy-sport` folder on the host.
4. Use the browser editor's terminal for the same `bun run` commands in this README.
   Reuse the dev server if it is already running.

Keep the host awake, online and VS Code running. This connects to your existing
files and data; it does not create an isolated copy. Remote Tunnels is intended
for access to your own machine, rather than a shared team login.
[Remote Tunnels setup](https://code.visualstudio.com/docs/remote/tunnels).

### Use agents from the browser

With the host tunnel running, open [VS Code Agents](https://insiders.vscode.dev/agents).
Sign in with GitHub, select your host, choose the `remy-sport` folder, then select
an agent and start or resume a session. The Agents window is currently **Preview**.
[Remote agent instructions](https://code.visualstudio.com/docs/agents/run/remote-agent-sessions).

You also need access to the selected agent provider; signing into the tunnel
alone does not provide it. GitHub Copilot is the standard sign-in route described
in the [Agents prerequisites](https://code.visualstudio.com/docs/agents/run/agents-window#prerequisites).

Tell the agent to read [AGENTS.md](AGENTS.md), use the repository commands, and
keep plans and handovers in [docs](docs/README.md). Sessions using this same
checkout share edits and ports, including the localhost behavior below.

### Open the app on your other device

`localhost:8787` in your tablet's browser means the tablet, not the development
computer. For this project's remote GUI, use its existing HTTPS tunnel. On the
development computer, leave `bun run dev` running and, in another terminal, run:

```sh
bun run ops tunnel -- --run
```

Open **https://dev-remy.ubuntusoftware.net** on your other device. This command
needs the project's Cloudflare access. The hostname is shared: use the existing
host if it is already serving the team's dev app.

The VS Code tunnel gives access to the editor and agents. The project tunnel
above gives access to the app. VS Code also offers [port forwarding](https://code.visualstudio.com/docs/debugtest/port-forwarding),
but its generated app URLs have not been verified here for sign-in and live reload.

These instructions were checked against Microsoft's documentation on 2026-09-08.
A complete remote browser walkthrough is still to be verified for this project.

## Using localhost while an agent works

**You can keep clicking around the app while an agent runs local tests.**
Tests use a separate server and database. Your clicks do not change their data,
and their test data does not change yours.

| Port | Who uses it? |
| --- | --- |
| **8787** | You and anyone manually browsing the app. |
| 8788 | Automated browser tests and screenshots. |
| 4173 | Layout tests, using sample data without a backend. |

There are still three ways we can affect each other:

- **Code edits update your page.** It may change or reload while you use it.
- **Manual browsing shares data.** If an agent uses 8787 too, you both affect
  the same app. Signing into the same account can also clash.
- **Stopping the dev server interrupts everyone using it.** Agents should leave
  it running and use the test commands below.

A second tab or a different dev port does not create a separate database.
The automated test commands handle that separation themselves.

## Check changes

```sh
bun run check
bun run test:e2e
```

`check` checks the code, builds the app, and runs unit, repository, backend and
layout tests. `test:e2e` tests complete user journeys against a real local backend.
Run both before considering a change verified.

The browser suite starts its own server on 8788, creates fresh test data, and
cleans up afterwards. Keep your dev server running on 8787.

For a smaller task:

| Command | Purpose |
| --- | --- |
| `bun run typecheck` | Check TypeScript types. |
| `bun run lint` | Check unused files and undeclared dependencies. |
| `bun run test` | Run unit, repository and backend tests. |
| `bun run test:watch` | Rerun those tests as files change. |
| `bun run test:render` | Check page layouts in a browser. |
| `bun run shots` | Capture screenshots. |

Run browser tests and screenshots one at a time: both use 8788.
Tests still read the shared source files, so code edits during a run can affect
its results.

## Deploy to staging

```sh
bun run deploy -- --env staging
```

This command checks the app, publishes it, verifies the deployment, runs staging
browser tests, and cleans up test sessions. Staging tests manage their temporary
admin access automatically.

To test an existing staging deployment:

```sh
bun run test:e2e -- --env staging
```

Tests against a deployment use its shared data. Only local browser runs get a
separate temporary database.

| Environment | Open |
| --- | --- |
| Local development | http://localhost:8787 |
| Staging | https://staging-remy.ubuntusoftware.net |
| Production | https://remy.ubuntusoftware.net |

For HTTPS access to your local app, run `bun run ops tunnel -- --run` alongside
`bun run dev`, then open https://dev-remy.ubuntusoftware.net. This reaches the
same local app and data, including from a phone.

## Other tasks

Use the commands in [package.json](package.json) for project workflows.
Pass arguments after `--`.

| Command | Purpose |
| --- | --- |
| `bun run model` | Pull in the Product Owner's model changes, migrate, seed and verify. |
| `bun run build` | Build the app. |
| `bun run preview` | Preview the build locally. |
| `bun run db` | Show database status and available commands. |
| `bun run ops -- --help` | List operations such as provisioning and dependency updates. |
| `bun run ops versions` | Show which version each environment is running. |

If a browser run is forcibly stopped, use the run UUID printed by the CLI:

```sh
bun run test:e2e -- --cleanup-run <run UUID>
```

This removes that local run's test storage. For a staging run, add `--env staging`
to clean up its recorded sessions instead.

## Find the code

The app uses React, a Cloudflare Worker and a D1 database. Its business model
comes from the companion `remy-sport-biz` repository.

| Location | Contents |
| --- | --- |
| [src/web](src/web) | Pages, components and styles. |
| [src/api](src/api) | Backend API. |
| [src/db](src/db) | Database schema, migrations and seed data. |
| [src/domain](src/domain) | Business model and validation schemas. |
| [scripts/](scripts/) | Shared development and deployment automation. |
| [tests/](tests/) | Automated checks. |
| [docs](docs/README.md) | Project status, plans and handovers. |

[wrangler.toml](wrangler.toml) defines deployment resources and settings.
[src/environment.ts](src/environment.ts) defines behavior allowed in each environment.
