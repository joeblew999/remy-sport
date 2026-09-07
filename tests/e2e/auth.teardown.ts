import { test as teardown } from "@playwright/test"
import { BASE } from "../helpers/auth"
import { endRunSessions } from "../helpers/session-cleanup"

teardown("end and verify only this run's sessions", async () => {
  await endRunSessions(BASE)
})
