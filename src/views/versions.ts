/**
 * Version display widget — fetches /api/versions and renders
 * current version, deploy history, and CF worker versions.
 */
export function versionsWidget(): string {
  return `
  <div id="version-info" class="mt-12 text-xs text-base-content/40"></div>
  <script>
    fetch('/api/versions')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.error) return
        const el = document.getElementById('version-info')
        const c = data.current || data
        const commitLink = c.git.github
          ? '<a href="' + c.git.github + '" class="link link-hover">' + c.git.commit + '</a>'
          : c.git.commit
        let html = '<strong>v' + c.app + '</strong> · ' + commitLink + ' · ' + c.git.branch
        if (c.url) html += '<br><a href="' + c.url + '" class="link link-hover">' + c.url + '</a>'

        // App deploy history
        if (data.history && data.history.length > 0) {
          html += '<details class="mt-3 text-left"><summary class="cursor-pointer">Deploy history (' + data.history.length + ')</summary><ul class="mt-1 space-y-1">'
          data.history.forEach(h => {
            const hCommit = h.git.github
              ? '<a href="' + h.git.github + '" class="link link-hover">' + h.git.commit + '</a>'
              : h.git.commit
            html += '<li>' + hCommit + ' · v' + h.app + ' · ' + h.git.branch + '</li>'
          })
          html += '</ul></details>'
        }

        // CF worker versions with preview links
        if (data.cf_versions && data.cf_versions.length > 0) {
          html += '<details class="mt-2 text-left"><summary class="cursor-pointer">CF versions (' + data.cf_versions.length + ')</summary><ul class="mt-1 space-y-1">'
          data.cf_versions.forEach(v => {
            const label = '#' + v.number + ' · ' + v.id.slice(0, 8) + ' · ' + v.source + ' · ' + new Date(v.created).toLocaleDateString()
            if (v.url) {
              html += '<li><a href="' + v.url + '" class="link link-hover">' + label + '</a></li>'
            } else {
              html += '<li>' + label + '</li>'
            }
          })
          html += '</ul></details>'
        }

        el.innerHTML = html
      })
      .catch(() => {})
  </script>`
}
