import { expect, it } from 'vitest'
import { affectsDeployment } from '../../scripts/lib/deployed-source'

it('requires republishing changes to application inputs and deployment configuration', () => {
  for (const path of ['src/auth.ts', 'src/web/vite.config.ts', 'wrangler.toml', 'package.json', 'bun.lock', 'patches/dependency.patch', 'scripts/deploy.ts']) {
    expect(affectsDeployment(path), path).toBe(true)
  }
})
it('allows documentation and test-runner repairs against unchanged application code', () => {
  for (const path of ['README.md', 'docs/plan.md', 'tests/e2e/login.spec.ts', 'scripts/e2e.ts', 'scripts/lib/staging-test-access.ts', '.github/workflows/check.yml']) {
    expect(affectsDeployment(path), path).toBe(false)
  }
})
// The Playwright configs are `tests/` in everything but where they sit — a
// browser choice, a worker count, a local dev command, none of it bundled.
// Turning on tracing in one refused a verification of a correct deployment.
it('allows the test runner to be configured', () => {
  for (const path of ['playwright.config.ts', 'playwright.render.config.ts']) {
    expect(affectsDeployment(path), path).toBe(false)
  }
})
// ...but not the ops scripts around them: `fonts.ts` generates what the page
// downloads and `domain.ts` writes into src/, so the directory does reach the
// deployment and the rule cannot tell its members apart.
it('still requires republishing when build tooling changes', () => {
  for (const path of ['scripts/ops.ts', 'scripts/ops/fonts.ts', 'scripts/ops/domain.ts', 'scripts/ops/flake.ts']) {
    expect(affectsDeployment(path), path).toBe(true)
  }
})
// A readme's screenshot is not an application input: the root holds config and
// documentation, the app's assets live under src/web, and the bundle is served
// from dist/client. One of these refused a verification of a good deployment.
it('allows a loose document or image at the repository root', () => {
  for (const path of ['README.md', 'shadcn-places-demo.png', 'screenshot.JPG', 'diagram.svg']) {
    expect(affectsDeployment(path), path).toBe(false)
  }
})
// Only at the root, though — an image in a subdirectory may well be shipped.
it('still requires republishing for assets inside the app', () => {
  for (const path of ['src/web/public/icon.png', 'public/logo.svg', 'src/web/hero.webp']) {
    expect(affectsDeployment(path), path).toBe(true)
  }
})
