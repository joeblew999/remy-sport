import { test, expect } from './fixture'
import { seedCache, entry, orpc } from '../helpers/seed-cache'
import { sessionFor } from '../helpers/actors'
import { projectPlayer } from '../helpers/projections'
import { visit } from '../helpers/surfaces'

for (const relation of ['PLAYER_HEAD_COACH', 'PLAYER_ASSISTANT_COACH', 'TEAM_MANAGER', 'HEAD_COACH'] as const) {
  test(`player edit entry follows the player-scoped relation: ${relation}`, async ({ page }) => {
    const player = projectPlayer('ply_001', [relation])
    await seedCache(page, [sessionFor('COACH'), entry(orpc.players.get, { id: 'ply_001' }, player)])
    await visit(page, 'player', { id: 'ply_001' })
    const edit = page.getByTestId('edit-player-ply_001')
    if (relation === 'PLAYER_HEAD_COACH' || relation === 'PLAYER_ASSISTANT_COACH') {
      await edit.click()
      await expect(page.getByTestId('player-form-ply_001')).toBeVisible()
      await expect(page.getByTestId('player-form-ply_001').locator('[name="dob"]')).toHaveCount(0)
    } else await expect(edit).toHaveCount(0)
  })
}
