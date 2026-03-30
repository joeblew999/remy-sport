import { createAccessControl } from "better-auth/plugins/access"

export const ac = createAccessControl({
  event: ["create", "read", "update", "delete"],
})

export const adminRole = ac.newRole({
  event: ["create", "read", "update", "delete"],
})

export const organizer = ac.newRole({
  event: ["create", "read", "update", "delete"],
})

export const coach = ac.newRole({
  event: ["read"],
})

export const player = ac.newRole({
  event: ["read"],
})

export const spectator = ac.newRole({
  event: ["read"],
})

export const referee = ac.newRole({
  event: ["read"],
})

export const roles = {
  admin: adminRole,
  organizer,
  coach,
  player,
  spectator,
  referee,
}
