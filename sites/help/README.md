# Remy Sport help — local, isolated preview

Run these commands **from the Remy Sport repository root**, using its pinned Bun
and Node toolchain. The docs command installs this package's own frozen lockfile;
you do not need to install its dependencies separately.

```sh
bun run ops docs dev
```

Wait for `live development ready`, then open **http://127.0.0.1:8791/**.
Keep that terminal running; **Ctrl-C** stops the development server and its children.
The CLI stops a previous help development server automatically before starting
or checking. It will not kill another application using port 8791.
`bun run ops docs stop` also stops this package’s development server if its
original terminal is no longer available.

Useful local URLs:

| URL | What it provides |
| --- | --- |
| http://127.0.0.1:8791/ | Help home page |
| http://127.0.0.1:8791/sign-in | Email-code sign-in guide |
| http://127.0.0.1:8791/sign-in.md | The same guide as Markdown |
| http://127.0.0.1:8791/for-assistants | How to retrieve and cite these guides |
| http://127.0.0.1:8791/llms.txt | Guide index for assistants |
| http://127.0.0.1:8791/llms-full.txt | All guide text |
| http://127.0.0.1:8791/sitemap.xml | Generated sitemap |

## Check or clean

```sh
bun run ops docs check
bun run ops docs clean
```

`check` installs, builds, checks the generated output and serves it briefly in
local Cloudflare emulation on a temporary port. It stops the server when done.
`clean` removes only this package's installed dependencies and generated output.
Stop a running production preview before checking or cleaning; development
servers are stopped automatically.

`dev` uses this package’s own Vite server. Edit `content/*.mdx` or `src/app.css`
and the open browser updates automatically. Configuration changes restart the
server automatically. The main app can keep running on its own port.

`bun run ops docs preview` builds and verifies the production output, then keeps
Cloudflare emulation running at the same URL. Use it to inspect the final static
HTML, Markdown and headers; it does not hot reload.

The preview stays **noindex** and uses `https://help.remy.invalid` as its reserved
canonical origin. It is not publicly discoverable or deployed. SEO/LLM checks
verify the generated documents, not Google indexing or Gemini recommendations.

## Isolation

This is not a root Bun workspace. Its dependencies, lockfile, configuration,
build output and Cloudflare configuration stay here. The app's source and asset
bundle are not imported or merged. Each command checks app/dependency fingerprints
before and after and reports unexpected changes without resetting files.

Do not run the content build from the app directory, install Fuma dependencies
in the root package, or point this package at the internal `docs/` directory.
The editor and collaboration packages are not included.

[Current evidence and feature plan](../../docs/2026-09-09-04-blume-public-help.md).
