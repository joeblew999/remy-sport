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

const RESOURCE_GROUPS: [string, string[]][] = [
  ["Events", ["event", "division", "registration"]],
  ["Teams & Players", ["team", "player", "roster", "find-team"]],
  ["Schedules & Brackets", ["bracket", "consolation-bracket", "fixture", "session", "court"]],
  ["Scores & Results", ["score", "attendance", "results-archive", "spoiler"]],
  ["Rankings", ["standings", "player-stats", "season-records"]],
  ["Live & Realtime", ["live-scores", "notifications", "live-stream", "court-status"]],
  ["AI", ["ai-assistant"]],
  ["Admin", ["user", "moderation"]],
]

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
        <h2 class="card-title">Permission Matrix <span class="badge badge-neutral badge-sm" id="resourceCount"></span></h2>
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
        <div id="resourceTabs"></div>
        <div id="resourcePanel" class="mt-4">
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
    const RESOURCE_GROUPS = ${JSON.stringify(RESOURCE_GROUPS)};

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
      const allResources = Object.keys(permissions.resources);
      document.getElementById('resourceCount').textContent = allResources.length + ' resources';

      for (const [group, resources] of RESOURCE_GROUPS) {
        const groupResources = resources.filter(function(r) { return allResources.includes(r); });
        if (groupResources.length === 0) continue;

        // Group header
        var headerTr = document.createElement('tr');
        var headerTd = document.createElement('td');
        headerTd.colSpan = 3;
        headerTd.className = 'bg-base-200 text-xs font-bold uppercase tracking-wider text-base-content/50 py-1';
        headerTd.textContent = group;
        headerTr.appendChild(headerTd);
        tbody.appendChild(headerTr);

        for (var i = 0; i < groupResources.length; i++) {
          var resource = groupResources[i];
          var info = permissions.resources[resource];
          var tr = document.createElement('tr');

          var tdName = document.createElement('td');
          tdName.className = 'font-semibold';
          tdName.textContent = RESOURCE_LABELS[resource] || resource;
          tr.appendChild(tdName);

          var tdActions = document.createElement('td');
          var actionsHtml = Object.entries(info.actions).map(function(pair) {
            var action = pair[0], allowed = pair[1];
            var label = ACTION_LABELS[action] || action;
            if (allowed) {
              return '<span class="badge badge-success badge-sm cursor-pointer hover:badge-outline" data-testid="perm-' + resource + '-' + action + '" onclick="tryAction(\\'' + resource + '\\',\\'' + action + '\\')">' + label + '</span>';
            }
            return '<span class="badge badge-neutral badge-sm opacity-30" data-testid="perm-' + resource + '-' + action + '">' + label + '</span>';
          }).join(' ');
          tdActions.innerHTML = actionsHtml;
          tr.appendChild(tdActions);

          var tdTypes = document.createElement('td');
          tdTypes.innerHTML = info.eventTypes.map(function(t) {
            return '<span class="badge badge-outline badge-xs">' + (EVENT_TYPE_LABELS[t] || t) + '</span>';
          }).join(' ');
          tr.appendChild(tdTypes);
          tbody.appendChild(tr);
        }
      }
    }

    // ── Resource tabs (grouped) ──────────────────────────────────────────

    function renderResourceTabs() {
      var container = document.getElementById('resourceTabs');
      container.innerHTML = '';
      var allResources = Object.keys(permissions.resources);

      for (var g = 0; g < RESOURCE_GROUPS.length; g++) {
        var group = RESOURCE_GROUPS[g][0];
        var resources = RESOURCE_GROUPS[g][1].filter(function(r) { return allResources.includes(r); });
        if (resources.length === 0) continue;

        var groupDiv = document.createElement('div');
        groupDiv.className = 'mb-2';
        var label = document.createElement('span');
        label.className = 'text-xs font-bold uppercase tracking-wider text-base-content/40 mr-2';
        label.textContent = group;
        groupDiv.appendChild(label);

        for (var i = 0; i < resources.length; i++) {
          var resource = resources[i];
          var btn = document.createElement('button');
          btn.className = 'btn btn-xs ' + (currentResource === resource ? 'btn-primary' : 'btn-ghost');
          btn.textContent = RESOURCE_LABELS[resource] || resource;
          btn.setAttribute('data-resource', resource);
          btn.onclick = function() { selectResource(this.getAttribute('data-resource')); };
          groupDiv.appendChild(btn);
        }
        container.appendChild(groupDiv);
      }
    }

    async function selectResource(resource) {
      currentResource = resource;
      renderResourceTabs();
      var info = permissions.resources[resource];
      var panel = document.getElementById('resourcePanel');

      // Find the read route
      var readRoute = info.routes['read'];
      if (!readRoute) {
        panel.innerHTML = '<p class="text-base-content/40">No read endpoint for this resource.</p>';
        return;
      }

      panel.innerHTML = '<div class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Loading…</div>';

      var result = await apiCall(readRoute.method, readRoute.path);

      if (result.status !== 200) {
        panel.innerHTML = '<div class="alert alert-error text-sm">Failed to load: ' + result.status + '</div>';
        return;
      }

      var body = result.body;
      // Find the data array in the response
      var dataKey = Object.keys(body).find(function(k) { return Array.isArray(body[k]); }) || Object.keys(body)[0];
      var items = Array.isArray(body[dataKey]) ? body[dataKey] : body[dataKey] ? [body[dataKey]] : [];

      var columns = items.length > 0 ? Object.keys(items[0]).filter(function(k) { return k !== 'createdBy'; }) : [];

      // Write actions available
      var writeActions = Object.entries(info.actions)
        .filter(function(pair) { return pair[0] !== 'read' && pair[1]; })
        .map(function(pair) { return pair[0]; });

      var html = '';

      if (writeActions.length > 0) {
        html += '<div class="flex gap-2 mb-4 flex-wrap">';
        for (var i = 0; i < writeActions.length; i++) {
          var action = writeActions[i];
          html += '<button class="btn btn-sm btn-success btn-outline" onclick="tryAction(\\'' + resource + '\\',\\'' + action + '\\')">' + (ACTION_LABELS[action] || action) + '</button>';
        }
        html += '</div>';
      } else {
        html += '<div class="alert alert-warning text-sm mb-4">Your role (' + permissions.role + ') has no write access to ' + (RESOURCE_LABELS[resource] || resource) + '.</div>';
      }

      html += '<div class="overflow-x-auto"><table class="table table-xs table-zebra"><thead><tr>';
      for (var c = 0; c < columns.length; c++) {
        html += '<th>' + columns[c] + '</th>';
      }
      html += '</tr></thead><tbody>';
      if (items.length === 0) {
        html += '<tr><td colspan="' + (columns.length || 1) + '" class="text-center text-base-content/40">No data yet</td></tr>';
      }
      for (var r = 0; r < Math.min(items.length, 50); r++) {
        html += '<tr>';
        for (var c = 0; c < columns.length; c++) {
          var val = items[r][columns[c]];
          var display = val === null ? '\\u2014' : typeof val === 'boolean' ? (val ? '\\u2713' : '\\u2717') : String(val).length > 30 ? String(val).slice(0, 30) + '\\u2026' : String(val);
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
      var info = permissions.resources[resource];
      var route = info.routes[action];
      if (!route) {
        logAction('?', resource + ':' + action, 0, { error: 'No route defined' });
        return;
      }

      var payload = buildPayload(resource, action);
      var path = route.path.replace('{id}', payload._id || '00000000-0000-0000-0000-000000000000');
      delete payload._id;

      var result = await apiCall(route.method, path, Object.keys(payload).length > 0 ? payload : undefined);

      var toast = document.createElement('div');
      toast.className = 'toast toast-end toast-top z-50';
      var alertClass = result.status < 300 ? 'alert-success' : result.status === 403 ? 'alert-error' : result.status === 422 ? 'alert-warning' : 'alert-info';
      var statusLabel = result.status === 201 ? 'Created!' : result.status === 200 ? 'Success' : result.status === 403 ? 'Forbidden (403)' : result.status === 401 ? 'Unauthorized (401)' : result.status === 422 ? 'Wrong event type (422)' : 'Error ' + result.status;
      toast.innerHTML = '<div class="alert ' + alertClass + ' text-sm shadow-lg"><span><strong>' + (ACTION_LABELS[action] || action) + ' ' + (RESOURCE_LABELS[resource] || resource) + '</strong>: ' + statusLabel + '</span></div>';
      document.body.appendChild(toast);
      setTimeout(function() { toast.remove(); }, 3000);

      if (currentResource === resource && result.status < 300) {
        setTimeout(function() { selectResource(resource); }, 300);
      }
    }

    function buildPayload(resource, action) {
      var eid = getFirstId('event');
      var ts = Date.now();
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
    var idCache = {};
    function getFirstId(resource) {
      return idCache[resource] || '00000000-0000-0000-0000-000000000000';
    }

    async function cacheIds() {
      var endpoints = {
        event: '/api/events',
        team: '/api/teams',
        player: '/api/players',
        match: '/api/matches',
        session: '/api/sessions',
        division: '/api/divisions',
        registration: '/api/registrations',
        bracket: '/api/brackets',
        'consolation-bracket': '/api/consolation-brackets',
        court: '/api/courts',
        score: '/api/scores',
      };
      for (var r of Object.keys(endpoints)) {
        try {
          var res = await fetch(endpoints[r]);
          if (res.ok) {
            var body = await res.json();
            var key = Object.keys(body).find(function(k) { return Array.isArray(body[k]); });
            if (key && body[key].length > 0) {
              idCache[r] = body[key][0].id;
            }
          }
        } catch(e) {}
      }
    }

    // ── Role switching ───────────────────────────────────────────────────

    async function switchRole(email, password) {
      await fetch('/api/auth/sign-out', { method: 'POST' });
      var res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      });
      if (res.ok) window.location.reload();
    }

    // ── Init ─────────────────────────────────────────────────────────────

    (async function() {
      await cacheIds();
      await loadPermissions();
    })();
  </script>`
}
