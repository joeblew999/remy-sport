// GENERATED from docs/matrix.json — do not edit manually.
// Regenerate: mise run matrix:generate

import { createAccessControl } from "better-auth/plugins/access"

export const ac = createAccessControl({
  event       : ["create","read","update","delete"],
  team        : ["create","read","update","delete"],
  player      : ["create","read","update"],
  roster      : ["manage"],
  bracket     : ["generate","read"],
  fixture     : ["generate","read"],
  session     : ["define","read"],
  court       : ["assign","read"],
  score       : ["enter","read"],
  attendance  : ["record","read"],
  user        : ["manage"],
})

export const adminRole = ac.newRole({
  event       : ["create","read","update","delete"],
  team        : ["create","read","update","delete"],
  player      : ["create","read","update"],
  roster      : ["manage"],
  bracket     : ["generate","read"],
  fixture     : ["generate","read"],
  session     : ["define","read"],
  court       : ["assign","read"],
  score       : ["enter","read"],
  attendance  : ["record","read"],
  user        : ["manage"],
})

export const organizer = ac.newRole({
  event       : ["create","read","update","delete"],
  team        : ["read"],
  player      : ["read"],
  bracket     : ["generate","read"],
  fixture     : ["generate","read"],
  session     : ["define","read"],
  court       : ["assign","read"],
  score       : ["enter","read"],
  attendance  : ["record","read"],
})

export const coach = ac.newRole({
  event       : ["read"],
  team        : ["create","read","update"],
  player      : ["create","read","update"],
  roster      : ["manage"],
  bracket     : ["read"],
  fixture     : ["read"],
  session     : ["read"],
  score       : ["read"],
  attendance  : ["record","read"],
})

export const player = ac.newRole({
  event       : ["read"],
  team        : ["read"],
  player      : ["create","read","update"],
  bracket     : ["read"],
  fixture     : ["read"],
  session     : ["read"],
  score       : ["read"],
})

export const spectator = ac.newRole({
  event       : ["read"],
  team        : ["read"],
  player      : ["read"],
  bracket     : ["read"],
  fixture     : ["read"],
  session     : ["read"],
  score       : ["read"],
})

export const referee = ac.newRole({
  event       : ["read"],
  bracket     : ["read"],
  fixture     : ["read"],
  court       : ["read"],
  score       : ["enter","read"],
})

export const roles = {
  admin: adminRole,
  organizer,
  coach,
  player,
  spectator,
  referee,
}
