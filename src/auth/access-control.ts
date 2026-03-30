import { createAccessControl } from "better-auth/plugins/access"

export const ac = createAccessControl({
  event:      ["create", "read", "update", "delete"],
  team:       ["create", "read", "update", "delete"],
  player:     ["create", "read", "update"],
  roster:     ["manage"],
  score:      ["enter", "read"],
  bracket:    ["generate", "read"],
  fixture:    ["generate", "read"],
  session:    ["define", "read"],       // camp sessions
  attendance: ["record", "read"],
  court:      ["assign", "read"],
  user:       ["manage"],               // admin only
})

export const adminRole = ac.newRole({
  event:      ["create", "read", "update", "delete"],
  team:       ["create", "read", "update", "delete"],
  player:     ["create", "read", "update"],
  roster:     ["manage"],
  score:      ["enter", "read"],
  bracket:    ["generate", "read"],
  fixture:    ["generate", "read"],
  session:    ["define", "read"],
  attendance: ["record", "read"],
  court:      ["assign", "read"],
  user:       ["manage"],
})

export const organizer = ac.newRole({
  event:      ["create", "read", "update", "delete"],
  score:      ["enter", "read"],
  bracket:    ["generate", "read"],
  fixture:    ["generate", "read"],
  session:    ["define", "read"],
  attendance: ["record", "read"],
  court:      ["assign", "read"],
  team:       ["read"],
  player:     ["read"],
})

export const coach = ac.newRole({
  event:      ["read"],
  team:       ["create", "read", "update"],
  player:     ["create", "read", "update"],
  roster:     ["manage"],
  attendance: ["record", "read"],
  score:      ["read"],
  bracket:    ["read"],
  fixture:    ["read"],
  session:    ["read"],
})

export const player = ac.newRole({
  event:      ["read"],
  player:     ["create", "read", "update"],  // own profile only — enforced by ownedBy
  score:      ["read"],
  bracket:    ["read"],
  fixture:    ["read"],
  session:    ["read"],
  team:       ["read"],
})

export const spectator = ac.newRole({
  event:      ["read"],
  score:      ["read"],
  bracket:    ["read"],
  fixture:    ["read"],
  session:    ["read"],
  team:       ["read"],
  player:     ["read"],
})

export const referee = ac.newRole({
  event:      ["read"],
  score:      ["enter", "read"],
  bracket:    ["read"],
  fixture:    ["read"],
  court:      ["read"],
})

export const roles = {
  admin: adminRole,
  organizer,
  coach,
  player,
  spectator,
  referee,
}
