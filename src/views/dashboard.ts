type User = { id: string; name: string | null; email: string; role?: string | null }

const ROLE_BADGES: Record<string, string> = {
  admin: "badge-error",
  organizer: "badge-primary",
  coach: "badge-secondary",
  player: "badge-accent",
  spectator: "badge-ghost",
  referee: "badge-warning",
  user: "badge-ghost",
}

const RESOURCE_LABELS: Record<string, string> = {
  event: "Events",
  division: "Divisions",
  registration: "Registrations",
  team: "Teams",
  player: "Players",
  roster: "Rosters",
  "find-team": "Find a Team",
  bracket: "Brackets",
  "consolation-bracket": "Consolation Brackets",
  fixture: "Fixtures",
  session: "Camp Sessions",
  court: "Courts",
  score: "Scores",
  attendance: "Attendance",
  "results-archive": "Results Archive",
  spoiler: "Spoiler Mode",
  standings: "Standings",
  "player-stats": "Player Stats",
  "season-records": "Season Records",
  "live-scores": "Live Scores",
  notifications: "Notifications",
  "live-stream": "Live Streams",
  "court-status": "Court Status",
  "ai-assistant": "AI Assistant",
  user: "User Management",
  moderation: "Moderation",
}

const ACTION_LABELS: Record<string, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  enter: "Enter",
  generate: "Generate",
  define: "Define",
  record: "Record",
  assign: "Assign",
  manage: "Manage",
  "register-team": "Register Team",
  "register-player": "Register Player",
  toggle: "Toggle",
  subscribe: "Subscribe",
  "create-event": "Create Event",
  "suggest-bracket": "Suggest Bracket",
  qa: "Q&A",
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  tournament: "Tournament",
  league: "League",
  camp: "Camp / Clinic",
  showcase: "Showcase",
}

export function dashboardPage(user: User): string {
  const role = user.role || "user"
  const badge = ROLE_BADGES[role] || "badge-ghost"

  return `
  <div class="w-full max-w-6xl px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Dashboard</h1>
        <p class="text-base-content/60">Access Control Matrix Explorer</p>
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

    <!-- Quick role switch (dev only) -->
    <div class="card bg-base-100 shadow mb-6">
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

    <!-- Full permission matrix -->
    <div class="card bg-base-100 shadow mb-6" data-testid="permission-matrix">
      <div class="card-body">
        <h2 class="card-title">Permission Matrix</h2>
        <p class="text-sm text-base-content/60 mb-4">
          Showing resolved permissions for <span class="badge ${badge} badge-sm">${role}</span>.
          Green = allowed, gray = denied. Click any allowed write action to try it.
        </p>
        <div class="overflow-x-auto">
          <table class="table table-sm" id="matrixTable">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Actions</th>
                <th>Event Types</th>
              </tr>
            </thead>
            <tbody id="matrixBody">
              <tr><td colspan="3" class="text-center text-base-content/40">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Resource explorer -->
    <div class="card bg-base-100 shadow mb-6" data-testid="resource-explorer">
      <div class="card-body">
        <h2 class="card-title">Resource Explorer</h2>
        <p class="text-sm text-base-content/60 mb-4">
          Select a resource to view its data and test write actions. Responses come live from the API.
        </p>
        <div class="flex gap-2 flex-wrap mb-4" id="resourceTabs"></div>
        <div id="resourcePanel">
          <p class="text-base-content/40 text-sm">Select a resource above to explore.</p>
        </div>
      </div>
    </div>

    <!-- Live action log -->
    <div class="card bg-base-100 shadow mb-6" data-testid="action-log">
      <div class="card-body">
        <div class="flex items-center justify-between">
          <h2 class="card-title">Action Log</h2>
          <button onclick="clearLog()" class="btn btn-ghost btn-xs">Clear</button>
        </div>
        <p class="text-sm text-base-content/60 mb-2">
          Every API call is logged here with method, status, and response.
        </p>
        <div id="logEntries" class="font-mono text-xs max-h-64 overflow-y-auto space-y-1">
          <p class="text-base-content/40">No actions yet.</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    const RESOURCE_LABELS = ${JSON.stringify(RESOURCE_LABELS)};
    const ACTION_LABELS = ${JSON.stringify(ACTION_LABELS)};
    const EVENT_TYPE_LABELS = ${JSON.stringify(EVENT_TYPE_LABELS)};

    let permissions = null;
    let currentResource = null;

    // ── Logging ──────────────────────────────────────────────────────────

    function logAction(method, path, status, body) {
      const el = document.getElementById('logEntries');
      if (el.querySelector('.text-base-content\\\\/40')) el.innerHTML = '';
      const color = status < 300 ? 'text-success' : status < 400 ? 'text-warning' : 'text-error';
      const statusLabel = status === 201 ? '201 Created' : status === 200 ? '200 OK' : status === 401 ? '401 Unauthorized' : status === 403 ? '403 Forbidden' : status === 422 ? '422 Wrong Event Type' : status + '';
      const time = new Date().toLocaleTimeString();
      const bodyStr = typeof body === 'object' ? JSON.stringify(body).slice(0, 120) : '';
      el.innerHTML = '<div class="flex gap-2"><span class="text-base-content/40">' + time + '</span><span class="font-bold">' + method + '</span><span>' + path + '</span><span class="' + color + ' font-bold">' + statusLabel + '</span><span class="text-base-content/50 truncate">' + bodyStr + '</span></div>' + el.innerHTML;
    }

    function clearLog() {
      document.getElementById('logEntries').innerHTML = '<p class="text-base-content/40">No actions yet.</p>';
    }

    // ── API helper ───────────────────────────────────────────────────────

    async function apiCall(method, path, data) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (data && method !== 'GET') opts.body = JSON.stringify(data);
      const res = await fetch(path, opts);
      let body;
      try { body = await res.json(); } catch { body = {}; }
      logAction(method, path, res.status, body);
      return { status: res.status, body };
    }

    // ── Permission matrix ────────────────────────────────────────────────

    async function loadPermissions() {
      const { status, body } = await apiCall('GET', '/api/permissions');
      if (status !== 200) return;
      permissions = body;
      renderMatrix();
      renderResourceTabs();
    }

    function renderMatrix() {
      const tbody = document.getElementById('matrixBody');
      tbody.innerHTML = '';
      for (const [resource, info] of Object.entries(permissions.resources)) {
        const tr = document.createElement('tr');
        // Resource name
        const tdName = document.createElement('td');
        tdName.className = 'font-semibold';
        tdName.textContent = RESOURCE_LABELS[resource] || resource;
        tr.appendChild(tdName);
        // Actions
        const tdActions = document.createElement('td');
        const actionsHtml = Object.entries(info.actions).map(([action, allowed]) => {
          const label = ACTION_LABELS[action] || action;
          if (allowed) {
            return '<span class="badge badge-success badge-sm cursor-pointer hover:badge-outline" data-testid="perm-' + resource + '-' + action + '" onclick="tryAction(\\'' + resource + '\\',\\'' + action + '\\')">' + label + '</span>';
          }
          return '<span class="badge badge-neutral badge-sm opacity-30" data-testid="perm-' + resource + '-' + action + '">' + label + '</span>';
        }).join(' ');
        tdActions.innerHTML = actionsHtml;
        tr.appendChild(tdActions);
        // Event types
        const tdTypes = document.createElement('td');
        tdTypes.innerHTML = info.eventTypes.map(t =>
          '<span class="badge badge-outline badge-xs">' + (EVENT_TYPE_LABELS[t] || t) + '</span>'
        ).join(' ');
        tr.appendChild(tdTypes);
        tbody.appendChild(tr);
      }
    }

    // ── Resource tabs ────────────────────────────────────────────────────

    function renderResourceTabs() {
      const container = document.getElementById('resourceTabs');
      container.innerHTML = '';
      for (const resource of Object.keys(permissions.resources)) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm ' + (currentResource === resource ? 'btn-primary' : 'btn-ghost');
        btn.textContent = RESOURCE_LABELS[resource] || resource;
        btn.onclick = () => selectResource(resource);
        container.appendChild(btn);
      }
    }

    async function selectResource(resource) {
      currentResource = resource;
      renderResourceTabs();
      const info = permissions.resources[resource];
      const panel = document.getElementById('resourcePanel');

      // Find the read route
      const readRoute = info.routes['read'];
      if (!readRoute) {
        panel.innerHTML = '<p class="text-base-content/40">No read endpoint for this resource.</p>';
        return;
      }

      panel.innerHTML = '<div class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Loading…</div>';

      const { status, body } = await apiCall(readRoute.method, readRoute.path);

      if (status !== 200) {
        panel.innerHTML = '<div class="alert alert-error text-sm">Failed to load: ' + status + '</div>';
        return;
      }

      // Find the data array in the response (it's usually the first array value)
      const dataKey = Object.keys(body).find(k => Array.isArray(body[k])) || Object.keys(body)[0];
      const items = Array.isArray(body[dataKey]) ? body[dataKey] : body[dataKey] ? [body[dataKey]] : [];

      // Build table
      const columns = items.length > 0 ? Object.keys(items[0]).filter(k => !['createdBy'].includes(k)) : [];

      // Write actions available
      const writeActions = Object.entries(info.actions)
        .filter(([action, allowed]) => action !== 'read' && allowed)
        .map(([action]) => action);

      let html = '';

      // Write action buttons
      if (writeActions.length > 0) {
        html += '<div class="flex gap-2 mb-4">';
        for (const action of writeActions) {
          html += '<button class="btn btn-sm btn-success btn-outline" onclick="tryAction(\\'' + resource + '\\',\\'' + action + '\\')">' + (ACTION_LABELS[action] || action) + '</button>';
        }
        html += '</div>';
      } else {
        html += '<div class="alert alert-warning text-sm mb-4">Your role (' + permissions.role + ') has no write access to ' + (RESOURCE_LABELS[resource] || resource) + '.</div>';
      }

      // Data table
      html += '<div class="overflow-x-auto"><table class="table table-xs table-zebra"><thead><tr>';
      for (const col of columns) {
        html += '<th>' + col + '</th>';
      }
      html += '</tr></thead><tbody>';
      if (items.length === 0) {
        html += '<tr><td colspan="' + (columns.length || 1) + '" class="text-center text-base-content/40">No data yet</td></tr>';
      }
      for (const item of items.slice(0, 50)) {
        html += '<tr>';
        for (const col of columns) {
          const val = item[col];
          const display = val === null ? '—' : typeof val === 'boolean' ? (val ? '✓' : '✗') : String(val).length > 30 ? String(val).slice(0, 30) + '…' : String(val);
          html += '<td class="text-xs">' + display + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      if (items.length > 50) {
        html += '<p class="text-xs text-base-content/40 mt-2">Showing first 50 of ' + items.length + ' items.</p>';
      }

      panel.innerHTML = html;
    }

    // ── Try write action ─────────────────────────────────────────────────

    async function tryAction(resource, action) {
      const info = permissions.resources[resource];
      const route = info.routes[action];
      if (!route) {
        logAction('?', resource + ':' + action, 0, { error: 'No route defined' });
        return;
      }

      // Build minimal valid payload for each resource+action
      const payload = buildPayload(resource, action);
      const path = route.path.replace('{id}', payload._id || '00000000-0000-0000-0000-000000000000');
      delete payload._id;

      const { status, body } = await apiCall(route.method, path, Object.keys(payload).length > 0 ? payload : undefined);

      // Show result in a toast
      const toast = document.createElement('div');
      toast.className = 'toast toast-end toast-top z-50';
      const alertClass = status < 300 ? 'alert-success' : status === 403 ? 'alert-error' : status === 422 ? 'alert-warning' : 'alert-info';
      const statusLabel = status === 201 ? 'Created!' : status === 200 ? 'Success' : status === 403 ? 'Forbidden (403)' : status === 401 ? 'Unauthorized (401)' : status === 422 ? 'Wrong event type (422)' : 'Error ' + status;
      toast.innerHTML = '<div class="alert ' + alertClass + ' text-sm shadow-lg"><span><strong>' + (ACTION_LABELS[action] || action) + ' ' + (RESOURCE_LABELS[resource] || resource) + '</strong>: ' + statusLabel + '</span></div>';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);

      // Refresh the resource panel if we're viewing it
      if (currentResource === resource && status < 300) {
        setTimeout(() => selectResource(resource), 300);
      }
    }

    function buildPayload(resource, action) {
      // Returns minimal valid payload for testing write actions
      const eid = getFirstId('event');
      const ts = Date.now();
      switch (resource) {
        case 'event':
          if (action === 'create') return { name: 'Test Event ' + ts, type: 'tournament' };
          if (action === 'update') return { name: 'Updated ' + ts };
          if (action === 'delete') return {};
          break;
        case 'division':
          if (action === 'create') return { eventId: eid, name: 'Div ' + ts, ageGroup: 'U14' };
          if (action === 'update') return { name: 'Updated Div ' + ts };
          if (action === 'delete') return {};
          break;
        case 'registration':
          if (action === 'register-team') return { eventId: eid, teamId: getFirstId('team') };
          if (action === 'register-player') return { eventId: eid, playerId: getFirstId('player') };
          break;
        case 'team':
          if (action === 'create') return { name: 'Test Team ' + ts, eventId: eid };
          if (action === 'update') return { name: 'Updated ' + ts };
          if (action === 'delete') return {};
          break;
        case 'player':
          if (action === 'create') return { name: 'Test Player ' + ts, position: 'Forward' };
          if (action === 'update') return { name: 'Updated ' + ts };
          break;
        case 'roster':
          return { teamId: getFirstId('team'), playerId: getFirstId('player') };
        case 'bracket':
        case 'consolation-bracket':
          return { eventId: eid, name: resource + ' ' + ts };
        case 'fixture':
          return { eventId: eid, name: 'Fixture ' + ts };
        case 'session':
          return { eventId: eid, name: 'Session ' + ts };
        case 'court':
          return { name: 'Court ' + ts, eventId: eid };
        case 'score':
          return { matchId: getFirstId('match'), homeScore: Math.floor(Math.random() * 10), awayScore: Math.floor(Math.random() * 10) };
        case 'attendance':
          return { eventId: eid, campSessionId: getFirstId('session'), playerId: getFirstId('player'), present: true };
        case 'spoiler':
          return { enabled: false };
        case 'notifications':
          return { type: 'push' };
        case 'live-stream':
          return { eventId: eid, title: 'Stream ' + ts, url: 'https://example.com/live' };
        case 'ai-assistant':
          if (action === 'create-event') return { prompt: 'Create a summer tournament' };
          if (action === 'suggest-bracket') return { eventId: eid, teamCount: 8 };
          if (action === 'qa') return { question: 'How do brackets work?' };
          break;
        case 'user':
          return { banned: false };
        case 'moderation':
          return { status: 'reviewed' };
      }
      return {};
    }

    // Cache of first IDs per resource for building payloads
    const idCache = {};
    function getFirstId(resource) {
      return idCache[resource] || '00000000-0000-0000-0000-000000000000';
    }

    async function cacheIds() {
      const resources = ['event', 'team', 'player', 'match', 'session'];
      const endpoints = {
        event: '/api/events',
        team: '/api/teams',
        player: '/api/players',
        match: '/api/matches',
        session: '/api/sessions',
      };
      for (const r of resources) {
        try {
          const res = await fetch(endpoints[r]);
          if (res.ok) {
            const body = await res.json();
            const key = Object.keys(body).find(k => Array.isArray(body[k]));
            if (key && body[key].length > 0) {
              idCache[r] = body[key][0].id;
            }
          }
        } catch {}
      }
    }

    // ── Role switching ───────────────────────────────────────────────────

    async function switchRole(email, password) {
      await fetch('/api/auth/sign-out', { method: 'POST' });
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) window.location.reload();
    }

    // ── Init ─────────────────────────────────────────────────────────────

    (async () => {
      await cacheIds();
      await loadPermissions();
    })();
  </script>`
}
