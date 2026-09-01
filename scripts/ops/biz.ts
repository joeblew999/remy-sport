/**
 * Clone or fast-forward the Product Owner's repo beside this one.
 *
 * `remy-sport-biz` is private and holds the model this repo copies in. Nothing
 * about building needs it — src/domain/vocabularies.ts is committed — so a
 * machine without the token is correctly configured; it just cannot pull a
 * newer model.
 *
 * ## Why the token never appears in a command
 *
 * A PAT in a URL lands in `.git/config`, in `ps` output, and in shell history,
 * and stays there. So git is given a `GIT_ASKPASS` helper instead: git calls it
 * when it wants a credential, the helper reads the value from its own
 * environment, and nothing is ever written down. The temporary directory holding
 * it is removed on the way out, and the last thing this does is grep
 * `.git/config` to prove the token did not get written there anyway — because a
 * check that the secret escaped is worth more than the belief that it cannot.
 *
 * This was a hundred and one lines of shell in mise.toml, which was a third of
 * that file. It is the same logic; it is just readable now.
 */

import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const DIR = process.env.BIZ_DIR ?? "../remy-sport-biz"
const URL = process.env.BIZ_REPO_URL ?? "https://github.com/joeblew999/remy-sport-biz.git"
const KEY = process.env.BIZ_TOKEN_KEY ?? "GITHUB_BIZ_REPO_TOKEN"

function fnox(name: string): string | null {
  try {
    const got = Bun.spawnSync(["fnox", "get", name], { stdout: "pipe", stderr: "ignore" })
    return got.exitCode === 0 ? got.stdout.toString().trim() || null : null
  } catch {
    return null // fnox not installed; Bun.spawnSync throws rather than returning a code
  }
}

const token = process.env[KEY]?.trim() || fnox(KEY)
if (!token) {
  console.error(`biz: ${KEY} is not set.

  remy-sport-biz is private, so this needs a GitHub fine-grained PAT scoped to
  joeblew999/remy-sport-biz with Contents: Read-only.

    Create one:  https://github.com/settings/personal-access-tokens/new
    Store it:    mise exec -- fnox set --global -p keychain ${KEY}
                 (hidden input — the value never reaches argv or shell history)

  Not having it only blocks pulling a newer model. Builds do not need this repo.`)
  process.exit(1)
}

const scratch = mkdtempSync(join(tmpdir(), "biz-askpass-"))
try {
  const askpass = join(scratch, "git-askpass")
  writeFileSync(
    askpass,
    `#!/bin/sh
case "$1" in
  Username*) printf '%s' x-access-token ;;
  *)         printf '%s' "$BIZ_PAT" ;;
esac
`,
  )
  chmodSync(askpass, 0o700)

  const env = {
    ...process.env,
    GIT_ASKPASS: askpass,
    BIZ_PAT: token,
    GIT_TERMINAL_PROMPT: "0",
  } as Record<string, string>

  const git = (args: string[], quiet = false) =>
    Bun.spawnSync(["git", ...args], {
      env,
      stdout: quiet ? "pipe" : "inherit",
      stderr: quiet ? "pipe" : "inherit",
    })

  const authFailed = () => {
    console.error(`biz: git could not authenticate.

  The PAT is most likely expired — these are deliberately short-lived — or it is
  missing Contents: Read-only on joeblew999/remy-sport-biz.

    mise exec -- fnox set --global -p keychain ${KEY}`)
    process.exit(1)
  }

  if (existsSync(join(DIR, ".git"))) {
    git(["-C", DIR, "remote", "set-url", "origin", URL], true)
    // `-c credential.helper=` empties the helper chain, so a stale entry in the
    // OS keychain cannot answer instead of the askpass above.
    if (git(["-c", "credential.helper=", "-C", DIR, "fetch", "--quiet", "origin"]).exitCode !== 0) authFailed()
    const behind = git(["-C", DIR, "rev-list", "--count", "HEAD..origin/main"], true).stdout.toString().trim()
    const head = () => git(["-C", DIR, "rev-parse", "--short", "HEAD"], true).stdout.toString().trim()
    if (behind === "0") {
      console.log(`biz: already up to date at ${head()}`)
    } else {
      git(["-C", DIR, "merge", "--ff-only", "origin/main"])
      console.log(`biz: fast-forwarded ${behind} commit(s) to ${head()}`)
    }
  } else {
    if (git(["-c", "credential.helper=", "clone", "--quiet", URL, DIR]).exitCode !== 0) authFailed()
    console.log(`biz: cloned into ${DIR}`)
  }

  const config = join(DIR, ".git", "config")
  if (existsSync(config) && readFileSync(config, "utf-8").includes(token)) {
    console.error(`biz: the token reached ${config} — refusing to leave it there`)
    process.exit(1)
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
