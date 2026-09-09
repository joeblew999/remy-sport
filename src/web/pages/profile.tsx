import { NewPlayer } from "../components/new-player";
import { PlatformCan } from "../components/can";
import { useSession } from "../lib/session";
import { WhoAreYou } from "../components/who-are-you";
import { YourPlayers } from "../components/your-players";
import { parseRoute, signInRoute, routeHref, type Route } from "../lib/router";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import { STORED_ROLE } from "../../domain/vocabularies";
import { ButtonLink } from "../components/button-link";
import { PageHeader, PageInner } from "../components/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Your account: who you are here, and the people you are responsible for.
 *
 * Not a dashboard. This page used to be the union of every role's sections —
 * live games, invitations, events, following — and each reader saw the other
 * roles' empty states. What is yours to *do* lives on Home now, built from
 * what you hold. What stays here is what is about the account itself: what
 * you are (a spectator may say they are more), and the children you are
 * guardian to, which is an account-level fact whatever else you hold — a coach
 * who is also a parent adds their child here.
 */
export function ProfilePage({ goto }: { goto: (r: Route) => void }) {
  const { user, loading } = useSession();
  const { label } = useLocale();
  const roleCode = Object.entries(STORED_ROLE).find(([, stored]) => stored === user?.role)?.[0];

  return (
    <>
      <PageHeader
        title={user ? m.welcome_back({ name: user.name || user.email }) : m.profile_signed_out()}
        sub={user ? m.profile_sub() : loading ? "" : m.profile_signed_out_sub()}
      />

      {!user && !loading && (
        <PageInner>
          <Card data-testid="profile-signin">
            <CardContent className="flex flex-col gap-4">
              <Alert><AlertDescription>{m.profile_signed_out_why()}</AlertDescription></Alert>
              <ButtonLink
                className="w-fit"
                data-testid="profile-signin-button"
                href={routeHref(signInRoute(parseRoute(window.location.hash)))}
              >
                {m.sign_in()}
              </ButtonLink>
            </CardContent>
          </Card>
        </PageInner>
      )}

      {user && (
        <PageInner className="flex flex-col gap-6" data-testid="profile">
          <Card data-testid="profile-identity">
            <CardHeader><CardTitle>{m.profile_account()}</CardTitle></CardHeader>
            {/* No `items-start`: the player form below is wrapped by the gate's
                `display: contents` div, and a block form whose fields are
                `w-full` shrinks to nothing inside a start-aligned column. */}
            <CardContent className="flex flex-col gap-3">
              <div>
                <p>{user.email}</p>
                <p className="text-muted-foreground">{roleCode ? label("roles", roleCode) : user.role}</p>
                {user.statusCode && <p className="text-muted-foreground">{label("userStatuses", user.statusCode)}</p>}
              </div>
              <ButtonLink variant="outline" className="w-fit" href={routeHref({ page: "home" })}>{m.profile_responsibilities()}</ButtonLink>
              <PlatformCan action="CREATE_PLAYER"><NewPlayer onCreated={(id) => goto({ page: "player", id })} /></PlatformCan>
            </CardContent>
          </Card>
          <WhoAreYou />
          <YourPlayers goto={goto} />
        </PageInner>
      )}
    </>
  );
}
