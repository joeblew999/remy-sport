/** Test/automation repairs can verify unchanged deployed application code. */
export function affectsDeployment(path: string): boolean {
  return !(path.startsWith('docs/') || path.startsWith('tests/') || path.startsWith('.github/') ||
    (!path.includes('/') && path.endsWith('.md')) ||
    ['scripts/e2e.ts', 'scripts/lib/staging-test-access.ts', 'scripts/lib/deployed-source.ts'].includes(path))
}
