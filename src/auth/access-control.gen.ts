// GENERATED from docs/matrix.json — do not edit manually.
// Regenerate: mise run matrix:generate

import { createAccessControl } from "better-auth/plugins/access"

export const ac = createAccessControl({
  event       : ["create","read","update","delete"],
  team        : ["create","read","update","delete"],
  player      : ["create","read","update"],
  roster      : ["manage"],
  score       : ["enter","read"],
  bracket     : ["generate","read"],
  fixture     : ["generate","read"],
  session     : ["define","read"],
  attendance  : ["record","read"],
  court       : ["assign","read"],
  user        : ["manage"],
})

export const adminRole = ac.newRole({
  event       : ["create","read","update","delete"],
  team        : ["create","read","update","delete"],
  player      : ["create","read","update"],
  roster      : ["manage"],
  score       : ["enter","read"],
  bracket     : ["generate","read"],
  fixture     : ["generate","read"],
  session     : ["define","read"],
  attendance  : ["record","read"],
  court       : ["assign","read"],
  user        : ["manage"],
})

export const organizer = ac.newRole({
  event       : ["create","read","update","delete"],
  team        : ["read"],
  player      : ["read"],
  score       : ["enter","read"],
  bracket     : ["generate","read"],
  fixture     : ["generate","read"],
  session     : ["define","read"],
  attendance  : ["record","read"],
  court       : ["assign","read"],
})

export const coach = ac.newRole({
  event       : ["read"],
  team        : ["create","read","update"],
  player      : ["create","read","update"],
  roster      : ["manage"],
  score       : ["read"],
  bracket     : ["read"],
  fixture     : ["read"],
  session     : ["read"],
  attendance  : ["record","read"],
})

export const player = ac.newRole({
  event       : ["read"],
  team        : ["read"],
  player      : ["create","read","update"],
  score       : ["read"],
  bracket     : ["read"],
  fixture     : ["read"],
  session     : ["read"],
})

export const spectator = ac.newRole({
  event       : ["read"],
  team        : ["read"],
  player      : ["read"],
  score       : ["read"],
  bracket     : ["read"],
  fixture     : ["read"],
  session     : ["read"],
})

export const referee = ac.newRole({
  event       : ["read"],
  score       : ["enter","read"],
  bracket     : ["read"],
  fixture     : ["read"],
  court       : ["read"],
})

export const roles = {
  admin: adminRole,
  organizer,
  coach,
  player,
  spectator,
  referee,
}
