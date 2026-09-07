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
