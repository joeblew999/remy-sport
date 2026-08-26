import { useCallback, useEffect, useState } from "react";
import { useSession } from "../lib/session";
import { toDevices, formatWhen, type Device, type RawSession } from "../lib/devices";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * "Where am I signed in?" — ADR 014.
 *
 * Better Auth core has provided /list-sessions and /revoke-session all along;
 * nothing used them. This matters more since ADR 012 moved sessions to 30 days:
 * a long-lived session is a convenience while it is yours and a problem once it
 * is not, and the only way to end one was to wait a month.
 *
 * Not the multiSession plugin, which is account *switching* — a different
 * feature that would not answer this question.
 */
export function DevicesPage({ goto }: { goto: (r: Route) => void }) {
  const { user, loading: sessionLoading } = useSession();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [listRes, currentRes] = await Promise.all([
        fetch("/api/auth/list-sessions", { credentials: "include" }),
        fetch("/api/auth/get-session", { credentials: "include" }),
      ]);
      if (!listRes.ok) {
        setError("Could not load your sessions.");
        return;
      }
      const sessions = (await listRes.json()) as RawSession[];
      const current = currentRes.ok ? await currentRes.json() : null;
      setDevices(toDevices(sessions, current?.session?.token ?? null));
      setError(null);
    } catch {
      setError("Could not load your sessions.");
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || !user) return;
    void load();
  }, [sessionLoading, user, load]);

  async function revoke(token: string) {
    setBusy(token);
    try {
      const res = await fetch("/api/auth/revoke-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError("Could not sign that device out.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    setBusy("others");
    try {
      const res = await fetch("/api/auth/revoke-other-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      if (!res.ok) {
        setError("Could not sign the other devices out.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (sessionLoading) return <div className="empty">{m.loading()}</div>;

  if (!user) {
    return (
      <div className="empty" data-testid="devices-signed-out">
        <p>Sign in to see where your account is being used.</p>
        <button className="btn primary" onClick={() => goto({ page: "login" })}>
          Sign in
        </button>
      </div>
    );
  }

  const others = devices?.filter((d) => !d.current) ?? [];

  return (
    <div className="page-inner" data-testid="devices-page">
      <div className="page-header">
        <div className="crumbs">SECURITY</div>
        <h1>{m.signed_in_devices()}</h1>
        <div className="sub">
          Sessions last 30 days. Sign out anything you don't recognise.
        </div>
      </div>

      {error && (
        <div className="empty" data-testid="devices-error">
          <p>{error}</p>
        </div>
      )}

      {devices === null ? (
        <div className="empty">{m.loading_sessions()}</div>
      ) : (
        <>
          <div className="dash-card" data-testid="devices-list">
            {devices.map((d) => (
              <div key={d.id} className="device-row" data-testid={`device-${d.id}`}>
                <div>
                  <div className="device-label">
                    {d.label}
                    {d.current && (
                      <span className="device-tag" data-testid="device-current">
                        this device
                      </span>
                    )}
                    {/* Worth surfacing: an admin viewing as you produces a real
                        session on your account, and you should be able to see it. */}
                    {d.impersonated && (
                      <span className="device-tag warn" data-testid="device-impersonated">
                        admin session
                      </span>
                    )}
                  </div>
                  <div className="device-meta">
                    {[d.ipAddress ?? "IP not recorded", `last active ${formatWhen(d.lastSeen)}`]
                      .join(" · ")}
                  </div>
                </div>
                {d.current ? (
                  <span className="device-meta">signed in {formatWhen(d.createdAt)}</span>
                ) : (
                  <button
                    className="btn"
                    data-testid={`revoke-${d.id}`}
                    disabled={busy === d.token}
                    onClick={() => void revoke(d.token)}
                  >
                    {busy === d.token ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </div>
            ))}
          </div>

          {others.length > 0 && (
            <div className="event-actions" style={{ marginTop: 16 }}>
              <button
                className="btn"
                data-testid="revoke-others"
                disabled={busy === "others"}
                onClick={() => void revokeOthers()}
              >
                {busy === "others"
                  ? "Signing out…"
                  : `Sign out all other devices (${others.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
