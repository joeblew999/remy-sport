import { expect, it } from 'vitest'
import { helpTarget, validateHelpConfig } from '../../scripts/ops/docs-release'

it('refuses staging help wired to production or given application bindings', () => {
  const target = helpTarget('staging')
  const config = { name: target.name, workers_dev: false, preview_urls: false, routes: [{ pattern: new URL(target.origin).hostname }], vars: { ENVIRONMENT: target.environment, APP_ORIGIN: target.appOrigin, HELP_ORIGIN: target.origin } }
  expect(() => validateHelpConfig(config, target)).not.toThrow()
  expect(() => validateHelpConfig({ ...config, vars: { ...config.vars, APP_ORIGIN: helpTarget('production').appOrigin } }, target)).toThrow('mismatch')
  expect(() => validateHelpConfig({ ...config, d1_databases: [] }, target)).toThrow('application bindings')
  expect(() => validateHelpConfig({ ...config, workers_dev: true }, target)).toThrow('alias')
  expect(() => helpTarget('typo')).toThrow('Unknown')
})
