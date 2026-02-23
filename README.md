# remy-sport

Sports platform for basketball, built on Cloudflare Workers.

## URLs

- **Local:** http://localhost:8787
- **Production:** https://remy-sport.gedw99.workers.dev
- **Repo:** https://github.com/joeblew999/remy-sport

## Prerequisites

- [bun](https://bun.sh)
- [task](https://taskfile.dev)
- [Cloudflare account](https://dash.cloudflare.com) (for deploy)

## Development

```sh
task setup   # install deps + apply local D1 migrations
task dev     # start local dev server at :8787
task check   # type check
task test    # run playwright tests
task test:ui # run playwright tests with UI
```

## Deploy

```sh
task deploy  # full pipeline: setup, check, test, versions, deploy, remote migrate, test:deployed
```

## Cloudflare Resources

```sh
task cf:d1:tables         # list local D1 tables
task cf:d1:tables:remote  # list remote D1 tables
task cf:secret:list       # list worker secrets
task cf:tail              # tail live worker logs
```

See `task --list` for all available tasks.
