import { QueryError, isNotFound } from "../components/query-error";
import { GameSummary } from "../components/game-summary";
import { NewPlayer } from "../components/new-player";
import { NameTranslations, namesFrom } from "../components/name-translations";
import { Can, PlatformCan, canAny } from "../components/can";
import { useState } from "react";
import { FollowButton } from "../components/follow";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useInitial } from "../lib/initial";
import { api, orpc } from "../lib/orpc";
import { useRoster, useTeam, useTeamGames } from "../lib/data";
import { routeHref, type Route } from "../lib/router";
import { m } from "../lib/i18n";
import { Muted, PageHeader, PageInner, SectionHeading } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLocale } from "../lib/locale";
import { useSession } from "../lib/session";
import { formErrors } from "../lib/form-errors";
import type { Team } from "../data";

/** Two letters for a crest or an avatar. */
const initials = (label: string) => label.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]!).join("");

/**
 * @answers VIEW_TEAM, EDIT_TEAM_PROFILE, MANAGE_ROSTER, CREATE_PLAYER
 *
 * A team as its coach and its followers see it. The roster is where a player
 * is created, because that is the moment somebody needs one.
 */
/**
 * One team, by id. Which teams are *yours* is Home's question, answered from
 * `me.mine`; `#/team` with no id renders the directory. This page used to
 * guess at "your team" from a list when it had no id, and guessed wrong.
 */
export function TeamPage({ id, goto: _goto, setParam, query, spoiler = false }: { id: string; goto: (r: Route) => void; setParam: (key: string, value: string | null) => void; query?: Record<string, string>; spoiler?: boolean }) {
  const teamQuery = useTeam(id);
  const { data: t, isPending: teamLoading } = teamQuery;
  const rosterQuery = useRoster(id);
  const { data: roster } = rosterQuery;
  const { label } = useLocale();
  const { user } = useSession();
  const gamesQuery = useTeamGames(id);
  const { data: teamGames, isPending: gamesLoading } = gamesQuery;
  const games = teamGames?.games ?? [];
  const wins = games.filter((g) => g.won === true).length;
  const losses = games.filter((g) => g.won === false).length;


  if (teamQuery.error && !t && !isNotFound(teamQuery.error)) return <PageInner><QueryError error={teamQuery.error} retry={teamQuery.refetch} pending={teamQuery.isFetching} /></PageInner>;
  if (teamLoading) return <PageInner><Loading>{m.loading_team()}</Loading></PageInner>;
  if (!t) {
    return (
      <PageInner>
        <EmptyState data-testid="not-found">{m.not_found_team()}</EmptyState>
      </PageInner>
    );
  }
  const canManage = canAny(t, "EDIT_TEAM_PROFILE", "MANAGE_ROSTER");
  // Old shared section links select the corresponding panel, without scrolling.
  const requested = query?.tab ?? query?.section;
  const tab = requested === "schedule" || (requested === "manage" && canManage) ? requested : "roster";
  return (
    <>
      <PageHeader
        data-testid="team-hero"
        // A team is reached from the directory, from a schedule, from a player.
        // It had no ancestors at all, so every one of those was a one-way trip.
        crumbs={[{ label: m.nav_teams(), href: routeHref({ page: "teams" }) }]}
        media={<Avatar size="lg" className="size-16" aria-hidden="true"><AvatarFallback className="bg-primary/15 text-lg font-semibold text-primary">{initials(t.name)}</AvatarFallback></Avatar>}
        title={<span data-testid="team-name">{t.name}</span>}
        sub={<><a className="hover:underline" href={routeHref({ page: "org", id: t.orgId })}>{t.orgName}</a>{t.city && ` · ${t.city}`}</>}
        subLang="th"
        // The record is the schedule below, counted: wins and losses among
        // the games that have a score, from this team's end. A dash stays for
        // a team that has not played. There is still no RANK: that is a
        // standings question, and it is answered on the event page.
        extra={
          <div className="text-right">
            <Muted as="div" className="text-xs">{m.record_all_events()}</Muted>
            <div data-testid="team-record" className={cn("text-3xl font-semibold tabular-nums", !(wins + losses) && "text-muted-foreground")}>
              {!spoiler && wins + losses ? `${wins}–${losses}` : "—"}
            </div>
          </div>
        }
      >
        <p className="mt-1 text-muted-foreground">{t.ageGroupLabel} {t.genderLabel} · {t.short}</p>
        <div className="mt-4 overflow-x-auto">
          <ButtonGroup>
            {t.id && <FollowButton objectTypeCode="TEAM" objectId={t.id} />}
          </ButtonGroup>
        </div>
      </PageHeader>

      <Tabs key={id} value={tab} onValueChange={next => setParam("tab", String(next))} className="gap-0">
        <TabsList variant="line" aria-label={m.nav_teams()} className="sticky top-0 z-10 h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-background px-4 sm:px-8">
          <TabsTrigger value="roster" data-testid="tab-roster" className="flex-none">{m.roster()}</TabsTrigger>
          <TabsTrigger value="schedule" data-testid="tab-schedule" className="flex-none">{m.schedule()}</TabsTrigger>
          {canManage && <TabsTrigger value="manage" data-testid="tab-manage" className="flex-none">{m.event_manage()}</TabsTrigger>}
        </TabsList>
        <TabsContent value="roster">
          <PageInner className="flex flex-col gap-6">
            {rosterQuery.isPending && <Loading />}
            {rosterQuery.error && <QueryError error={rosterQuery.error} retry={rosterQuery.refetch} pending={rosterQuery.isFetching} />}
            {roster && <>
              {/* Real players now — `player` and `playerTeam`, current spells only.
                  No per-game averages: the fixture this replaced showed points,
                  assists and rebounds per person and there is no stats table, so they
                  are absent rather than invented a second time. */}
              <section>
                {roster?.players.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="roster">
                    {roster.players.map(p => (
                      <Item size="sm" key={p.playerId} variant="outline" className="items-start" data-testid={`player-${p.playerId}`}>
                        <ItemMedia><Avatar size="lg" aria-hidden="true"><AvatarFallback>{initials(p.name)}</AvatarFallback></Avatar></ItemMedia>
                        <ItemContent>
                          {/* The way in to the player page. The roster was the only place
                              a player appeared and there was nowhere to go from it —
                              which is why FOLLOW_PLAYER had a button nothing rendered. */}
                          <ItemTitle>
                            <a className="hover:underline" data-testid={`open-player-${p.playerId}`} href={routeHref({ page: "player", id: p.playerId })}>{p.name}</a>
                          </ItemTitle>
                          <ItemDescription>
                            {p.position}
                            {p.since && <> · {m.roster_since({ date: p.since })}</>}
                          </ItemDescription>
                        </ItemContent>
                        <span className="text-2xl font-semibold tabular-nums text-muted-foreground/60" aria-hidden="true">{p.jerseyNumber}</span>
                      </Item>
                    ))}
                  </div>
                ) : (
                  <EmptyState data-testid="roster-empty">{m.roster_empty()}</EmptyState>
                )}
              </section>

              {/* Who runs the team. `team_coaches` carried this from the day the
                  fixtures were written and the page never said — a squad with no
                  staff reads as a team nobody coaches. */}
              <section>
                <SectionHeading title={m.coaching_staff()} className="mt-0" />
                <ItemGroup data-testid="coaching-staff">
                  {!user && <EmptyState className="border-0" data-testid="coaches-signin">{m.coaching_staff_signin()}</EmptyState>}
                  {user && (roster?.coaches.length ?? 0) === 0 && <EmptyState className="border-0" data-testid="coaches-empty">{m.coaching_staff_none()}</EmptyState>}
                  {(roster?.coaches ?? []).map((c) => (
                    <Item variant="outline" size="sm" key={c.userId} data-testid={`coach-${c.userId}`}>
                      <ItemMedia><Avatar aria-hidden="true"><AvatarFallback>{initials(c.name)}</AvatarFallback></Avatar></ItemMedia>
                      <ItemContent>
                        <ItemTitle>{c.name}</ItemTitle>
                        {/* From the reference vocabulary, in the reader's language — not
                            a map of role codes written out here. */}
                        <ItemDescription>{label("coachRoles", c.coachRoleCode)}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </section>

            </>}
          </PageInner>
        </TabsContent>
        {canManage && <TabsContent value="manage" keepMounted>
          <PageInner className="flex flex-col gap-6">
            {/* `teams.update` was enforced by EDIT_TEAM_PROFILE and unreachable, so
                a team named wrong when it was created stayed named wrong. */}
            <Can of={t} action="EDIT_TEAM_PROFILE"><TeamSettings key={t.id} team={t}/></Can>

            {/* Only for someone the server says may manage this squad — a head or
                assistant coach, or the team's manager. MANAGE_ROSTER, asked per
                team, not worked out from the viewer's role. */}
            <Can of={t} action="MANAGE_ROSTER">
              {roster && <ManageRoster teamId={id} roster={roster}/>}
              {rosterQuery.isPending && <Loading />}
              {rosterQuery.error && <QueryError error={rosterQuery.error} retry={rosterQuery.refetch} pending={rosterQuery.isFetching} />}
            </Can>
          </PageInner>
        </TabsContent>}
        <TabsContent value="schedule">
          <PageInner>
            <section>
              <ItemGroup>
                {gamesLoading && <Loading className="border-0" />}
                {gamesQuery.error && <QueryError error={gamesQuery.error} retry={gamesQuery.refetch} pending={gamesQuery.isFetching} />}
                {!gamesLoading && !gamesQuery.error && games.length === 0 && <EmptyState className="border-0">{m.no_games_yet()}</EmptyState>}
                {games.map((g) => (
                  <Item variant="outline" size="sm" className={cn("flex-wrap", g.live && "bg-destructive/5")} key={g.id} data-testid="team-fixture">
                    <ItemContent className="basis-full sm:basis-auto">
                      <GameSummary game={g} showEvent/>
                    </ItemContent>
                    <ItemContent className="ml-auto flex-none items-end text-right">
                      {/* Both or neither. A played game has two scores; anything else
                          is a fixture, and "61–" is not a result. */}
                      <span className="text-base font-semibold tabular-nums" data-testid="fixture-result">
                        {!spoiler && g.us !== null && g.them !== null
                          ? `${g.us}–${g.them}`
                          : <span className="text-muted-foreground">—</span>}
                      </span>
                      {/* The status the server stored, except where the result says
                          more than "finished" does. */}
                      <Badge data-testid="fixture-outcome" variant={g.live ? "destructive" : g.won === true ? "default" : "outline"}>
                        {spoiler ? g.statusLabel : g.live
                          ? m.status_live()
                          : g.won === true
                            ? m.col_won()
                            : g.won === false
                              ? m.col_lost()
                              : g.statusLabel}
                      </Badge>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          </PageInner>
        </TabsContent>
      </Tabs>
    </>
  );
}


type Roster = NonNullable<ReturnType<typeof useRoster>["data"]>;

/**
 * Adding and removing players.
 *
 * Whole-form errors only: the form is a select and a button, so a validation
 * issue has no field to sit under. "Unknown player" and a 403 are the failures
 * this can produce, and both belong at the top.
 *
 * Removing *ends the spell* rather than deleting it — `playerTeam` carries from
 * and to dates, and the TEAM_PLAYER relation reads `to_date`, so a departure
 * stops granting access without making last season's team sheet wrong. The
 * button therefore says "remove from squad", not "delete".
 */
function ManageRoster({ teamId, roster }: { teamId: string; roster: Roster }) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: orpc.teams.roster.key({ input: { teamId } }) });

  const add = useMutation({
    mutationFn: (playerId: string) => api.teams.addPlayer({ teamId, playerId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (playerId: string) => api.teams.removePlayer({ teamId, playerId }),
    onSuccess: invalidate,
  });
  const error = add.error ?? remove.error;

  // `data-action`: the model action this control performs, read by
  // tests/render/who-sees-what.spec.ts to check the screen against the
  // model's grants for every relation a reader can hold on a team.
  return (
    <Card data-testid="manage-roster">
      <CardHeader><CardTitle>{m.manage_roster()}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
      {/* formErrors, not `error.message`: the raw message is the Worker's own
          English ("Not found"), which reached a Thai reader verbatim. */}
      {formErrors(error).form && (
        <Alert variant="destructive" data-testid="roster-error">
          <AlertDescription>{formErrors(error).form}</AlertDescription>
        </Alert>
      )}

      {roster.players.length > 0 && (
        <Table data-testid="roster-table">
          <TableBody>
            {roster.players.map((p) => (
              <TableRow key={p.playerId}>
                <TableCell className="whitespace-normal font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.position}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="destructive"
                    data-testid={`remove-player-${p.playerId}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(p.playerId)}
                  >
                    {m.remove_from_squad()}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {roster.available.length ? (
        <form
          data-testid="add-player-form"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(String(new FormData(e.currentTarget).get("player")));
          }}
        >
          <FieldGroup className="max-w-[420px]">
            <Field>
              <FieldLabel htmlFor="add-player-select">{m.roster()}</FieldLabel>
              <NativeSelect id="add-player-select" name="player" data-testid="add-player-select">
                {roster.available.map((p) => (
                  <NativeSelectOption key={p.playerId} value={p.playerId}>
                    {p.jerseyNumber} · {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" data-testid="add-player-submit" disabled={add.isPending} className="w-fit">
              {m.add_to_squad()}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <p className="text-muted-foreground" data-testid="no-available-players">{m.everyone_on_squad()}</p>
      )}

      <PlatformCan action="CREATE_PLAYER"><NewPlayer teamId={teamId} onCreated={invalidate} /></PlatformCan>
      </CardContent>
    </Card>
  );
}

/**
 * Editing the team you coach.
 *
 * `teams.update` has been enforced by `EDIT_TEAM_PROFILE` since teams existed
 * and nothing could call it, so a team named wrong when it was created stayed
 * named wrong — and the age group and category, which decide which events it
 * can enter, could never be corrected either.
 *
 * Shown only where `can.EDIT_TEAM_PROFILE` is true, which is the model's answer for this
 * reader on this team. `orgId` is deliberately not offered: moving a team
 * between schools is a transfer, needs membership of both, and the API omits
 * it from `UpdateTeamInput` for exactly that reason. A form that offered it
 * would be a form promising something the contract refuses.
 *
 * The vocabularies come from `/api/reference`, so an age group added to the
 * model appears here without an edit — the same rule the game-status select
 * follows.
 */
function TeamSettings({ team }: { team: Team }) {
  const qc = useQueryClient();
  const { terms, name } = useLocale();
  const [saved, setSaved] = useState(false);
  // The fields open with the team as it was, and keep that after the save's
  // refetch — see lib/initial.ts. Keyed by id where rendered.
  const initial = useInitial(team);

  const save = useMutation({
    mutationFn: (v: { names: Record<string, string>; ageGroupCode: string; genderCode: string }) =>
      api.teams.update({
        id: team.id,
        // The rest of the locale map survives — sending `{ en }` alone would
        // delete the Thai and Japanese names on the first save.
        names: v.names,
        ageGroupCode: v.ageGroupCode as never,
        genderCode: v.genderCode as never,
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: orpc.teams.key() });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const err = formErrors(save.error, ["names[en]"]);

  return (
    <Card data-testid="team-settings">
      <CardHeader><CardTitle>{m.team_settings()}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
      {saved && (
        <Alert role="status" data-testid="team-saved">
          <AlertDescription>{m.event_saved()}</AlertDescription>
        </Alert>
      )}
      {err.form && (
        <Alert variant="destructive" data-testid="team-settings-error">
          <AlertDescription>{err.form}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            names: namesFrom(f, team.names),
            ageGroupCode: String(f.get("ageGroupCode")),
            genderCode: String(f.get("genderCode")),
          });
        }}
      >
        <FieldGroup className="max-w-[420px]">
          <Field data-invalid={!!err.field("names[en]") || undefined}>
            <FieldLabel htmlFor="team-name">{m.team_name_label()}</FieldLabel>
            <Input
              id="team-name"
              name="name"
              data-testid="team-name-input"
              defaultValue={initial.names.en ?? initial.name}
              required
              autoComplete="off"
            />
            {err.field("names[en]") && (
              <FieldError data-testid="team-name-issue">
                {err.field("names[en]")}
              </FieldError>
            )}
          </Field>

          <NameTranslations names={initial.names} id="team-name" />

          <Field>
            <FieldLabel htmlFor="team-age">{m.team_age_label()}</FieldLabel>
            <NativeSelect id="team-age" name="ageGroupCode" data-testid="team-age-input" defaultValue={initial.ageGroupCode}>
              {terms("ageGroups").map((a) => (
                <NativeSelectOption key={a.code} value={a.code}>{name(a.names, a.code)}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="team-gender">{m.team_gender_label()}</FieldLabel>
            <NativeSelect id="team-gender" name="genderCode" data-testid="team-gender-input" defaultValue={initial.genderCode}>
              {terms("genders").map((g) => (
                <NativeSelectOption key={g.code} value={g.code}>{name(g.names, g.code)}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Button type="submit" data-testid="team-save" disabled={save.isPending} className="w-fit">
            {save.isPending ? m.event_saving() : m.event_save()}
          </Button>
        </FieldGroup>
      </form>
      </CardContent>
    </Card>
  );
}
