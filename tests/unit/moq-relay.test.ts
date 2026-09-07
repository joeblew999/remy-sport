import { expect, it } from 'vitest'
import { relayUrl } from '../../src/web/lib/moq'
import { CLOUDFLARE_MOQ_ORIGIN } from '../../src/moq-relay'

it('uses the Cloudflare token path from a locally served app too', () => {
  expect(relayUrl({ url: CLOUDFLARE_MOQ_ORIGIN, token: 'publish-token' }))
    .toBe(`${CLOUDFLARE_MOQ_ORIGIN}/publish-token`)
})

it('keeps scoped adapter JWTs in the query', () => {
  expect(relayUrl({ url: 'https://relay.example.test/games/A', token: 'scoped-token' }))
    .toBe('https://relay.example.test/games/A?jwt=scoped-token')
})
