type User = { id: string; name: string | null; email: string; role?: string | null }
type Event = { id: string; name: string; type: string; description: string | null; createdBy: string; createdAt: string }

const ROLE_BADGES: Record<string, string> = {
  admin: "badge-error",
  organizer: "badge-primary",
  coach: "badge-secondary",
  player: "badge-accent",
  spectator: "badge-ghost",
  referee: "badge-warning",
  user: "badge-ghost",
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["create", "read", "update", "delete"],
  organizer: ["create", "read", "update", "delete"],
  coach: ["read"],
  player: ["read"],
  spectator: ["read"],
  referee: ["read"],
  user: ["read"],
}

export function dashboardPage(user: User, events: Event[]): string {
  const role = user.role || "user"
  const badge = ROLE_BADGES[role] || "badge-ghost"
  const perms = ROLE_PERMISSIONS[role] || ["read"]
  const canCreate = perms.includes("create")
  const canDelete = perms.includes("delete")

  const eventRows = events.length === 0
    ? `<tr><td colspan="5" class="text-center text-base-content/40">No events yet. ${canCreate ? "Create one below." : "Sign in as organizer or admin to create events."}</td></tr>`
    : events.map((e) => `
        <tr>
          <td>${e.name}</td>
          <td><span class="badge badge-sm badge-outline">${e.type}</span></td>
          <td class="text-sm text-base-content/60">${e.description || "—"}</td>
          <td class="text-sm text-base-content/40">${new Date(e.createdAt).toLocaleDateString()}</td>
          <td>
            ${canDelete && (e.createdBy === user.id || role === "admin")
              ? `<button onclick="deleteEvent('${e.id}')" class="btn btn-ghost btn-xs text-error">Delete</button>`
              : ""}
          </td>
        </tr>`).join("")

  return `
  <div class="w-full max-w-4xl px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Dashboard</h1>
        <p class="text-base-content/60">Events & Authorization Demo</p>
      </div>
      <div class="text-right">
        <p class="font-semibold">${user.name || user.email}</p>
        <span class="badge ${badge}" data-testid="role-badge">${role}</span>
        <div class="mt-1">
          <a href="/" class="link text-sm text-base-content/40">Home</a>
          <span class="mx-1 text-base-content/20">|</span>
          <a href="/api/auth/sign-out" class="link text-sm text-base-content/40">Sign Out</a>
        </div>
      </div>
    </div>

    <!-- Permission summary -->
    <div class="card bg-base-100 shadow mb-6">
      <div class="card-body py-4">
        <h2 class="card-title text-sm uppercase tracking-wider text-base-content/40">Your Permissions (Event)</h2>
        <div class="flex gap-2 flex-wrap" data-testid="permissions">
          ${["create", "read", "update", "delete"].map((p) =>
            `<span class="badge ${perms.includes(p) ? "badge-success" : "badge-neutral opacity-30"}" data-testid="perm-${p}">${p}</span>`
          ).join("")}
        </div>
      </div>
    </div>

    <!-- Events table -->
    <div class="card bg-base-100 shadow mb-6">
      <div class="card-body">
        <h2 class="card-title">Events</h2>
        <div class="overflow-x-auto">
          <table class="table" data-testid="events-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${eventRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create event form (only shown for authorized roles) -->
    ${canCreate ? `
    <div class="card bg-base-100 shadow mb-6" data-testid="create-event-form">
      <div class="card-body">
        <h2 class="card-title">Create Event</h2>
        <div class="alert alert-error text-sm hidden" id="createError"></div>
        <div class="alert alert-success text-sm hidden" id="createSuccess"></div>
        <form id="createEventForm" class="flex flex-col gap-3">
          <input type="text" name="name" placeholder="Event name" required autocomplete="off" class="input input-bordered" />
          <select name="type" required class="select select-bordered">
            <option value="tournament">Tournament</option>
            <option value="league">League</option>
            <option value="camp">Camp / Clinic</option>
            <option value="showcase">Showcase</option>
          </select>
          <input type="text" name="description" placeholder="Description (optional)" autocomplete="off" class="input input-bordered" />
          <button type="submit" class="btn btn-primary">Create Event</button>
        </form>
      </div>
    </div>` : `
    <div class="card bg-base-100 shadow mb-6 opacity-50" data-testid="create-event-denied">
      <div class="card-body">
        <h2 class="card-title">Create Event</h2>
        <p class="text-base-content/40">Your role (<strong>${role}</strong>) does not have permission to create events.</p>
      </div>
    </div>`}

    <!-- Quick role switch (dev only) -->
    <div class="card bg-base-100 shadow">
      <div class="card-body py-4">
        <h2 class="card-title text-sm uppercase tracking-wider text-base-content/40">Switch Role (Dev)</h2>
        <div class="flex gap-2 flex-wrap" data-testid="role-switcher">
          <button onclick="switchRole('admin@remy.dev','admin1234!')" class="btn btn-xs ${role === 'admin' ? 'btn-error' : 'btn-ghost'}">Admin</button>
          <button onclick="switchRole('organizer@remy.dev','organizer1!')" class="btn btn-xs ${role === 'organizer' ? 'btn-primary' : 'btn-ghost'}">Organizer</button>
          <button onclick="switchRole('coach@remy.dev','coach12345!')" class="btn btn-xs ${role === 'coach' ? 'btn-secondary' : 'btn-ghost'}">Coach</button>
          <button onclick="switchRole('player@remy.dev','player1234!')" class="btn btn-xs ${role === 'player' ? 'btn-accent' : 'btn-ghost'}">Player</button>
          <button onclick="switchRole('spectator@remy.dev','spectator1!')" class="btn btn-xs ${role === 'spectator' ? 'btn-ghost btn-active' : 'btn-ghost'}">Spectator</button>
          <button onclick="switchRole('referee@remy.dev','referee1234!')" class="btn btn-xs ${role === 'referee' ? 'btn-warning' : 'btn-ghost'}">Referee</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function switchRole(email, password) {
      // Sign out first
      await fetch('/api/auth/sign-out', { method: 'POST' })
      // Sign in as new role
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) window.location.reload()
    }

    async function deleteEvent(id) {
      if (!confirm('Delete this event?')) return
      const res = await fetch('/api/events/' + id, { method: 'DELETE' })
      if (res.ok) window.location.reload()
      else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete')
      }
    }

    document.getElementById('createEventForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const form = e.target
      const errorEl = document.getElementById('createError')
      const successEl = document.getElementById('createSuccess')
      errorEl.classList.add('hidden')
      successEl.classList.add('hidden')

      const body = {
        name: form.name.value,
        type: form.type.value,
        description: form.description.value || undefined,
      }

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        successEl.textContent = 'Event created!'
        successEl.classList.remove('hidden')
        form.reset()
        setTimeout(() => window.location.reload(), 500)
      } else {
        const data = await res.json().catch(() => ({}))
        errorEl.textContent = data.error || 'Failed to create event'
        errorEl.classList.remove('hidden')
      }
    })
  </script>`
}
