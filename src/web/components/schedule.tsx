/**
 * An event's games: the schedule, the scores, and score entry for whoever may.
 *
 * Whether the score inputs appear is `game.can.ENTER_SCORES`, which the server
 * computes per game from the Product Owner's grants. There is no role check
 * here and there must not be one: a referee is assigned to *this* game and not
 * the next one, so a rule in the client could only be right by accident.
 *
 * Spoiler mode hides results without hiding the fixture. Someone following a
 * tournament they have not watched yet still needs to know who is playing and
 * when — that is the difference between hiding a score and hiding a game.
 */

import { useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, orpc } from "../lib/orpc";
import { useEntries, useEventVenues, useGames } from "../lib/data";
import { useLocale } from "../lib/locale";
import { formErrors } from "../lib/form-errors";
import { m } from "../lib/i18n";
import { routeHref, type Route } from "../lib/router";
import type { Event } from "../data";
import { formatTimeOn, fromLocalInput, toLocalInput } from "../lib/dates";
import { Can } from "./can";
import { GameSummary } from "./game-summary";
import { GameStats } from "./game-stats";
import { EmptyState, Loading } from "./states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "./button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemGroup } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Muted, SectionHeading } from "./page"
import { Label } from "@/components/ui/label";

/** Fixture/result changes also alter event progress, standings and team records. */
function refreshGameViews(qc: QueryClient) {
  return Promise.all([orpc.games.key(), orpc.events.key(), orpc.standings.key(), orpc.teams.key()]
    .map((queryKey) => qc.invalidateQueries({ queryKey })));
}

type Game = NonNullable<ReturnType<typeof useGames>["data"]>["games"][number];

/** An error with no field to sit under, as the system's Alert, on its own line. */
function FormAlert({ children, ...props }: { children: React.ReactNode; "data-testid"?: string }) {
  return (
    <Alert variant="destructive" className="basis-full" {...props}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/**
 * When a game starts, on a named clock, in the reader's language.
 *
 * `startsAt` is an instant in UTC. That is unambiguous and useless on its own:
 * "10:00" means nothing until it says whose ten o'clock. So this takes the zone
 * explicitly and never falls back to the machine's — a page that guesses is how
 * a coach turns up an hour late.
 *
 * The locale is the app's, not the browser's — `undefined` here meant a Thai
 * page rendered "Aug 27" because the browser was set to English.
 *
 * The calendar is not chosen here. `CALENDAR` in lib/dates.ts is, once, for
 * every date on the site — which is what makes "offer Buddhist dates" a
 * decision somebody can actually take rather than a hunt through call sites.
 *
 * Formatting goes through `Intl`, not through the date library this repo does
 * now depend on. That is not an inconsistency, it is the split described in
 * lib/dates.ts: `temporal-polyfill/fns` does arithmetic `Date` cannot do
 * correctly, and `Intl` does formatting no library should be re-shipping —
 * `date-fns-tz`'s `formatInTimeZone` is a wrapper over exactly this call.
 */
function timeOf(startsAt: string, locale: string, timeZone: string | null): string {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return formatTimeOn(locale, d, timeZone);
  } catch {
    // An IANA name the runtime does not know throws rather than degrading.
    // A time on the wrong clock is worse than a time with no clock named, so
    // fall back to the instant rather than to the machine's own zone.
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

/**
 * @answers MANAGE_FIXTURES, GENERATE_FIXTURES, ASSIGN_COURTS, ASSIGN_REFEREE, ENTER_SCORES, CONFIRM_MATCH_STATUS
 *
 * Everything an organiser does to a fixture list.
 */
export function Schedule({
  eventId,
  can,
  spoiler,
  goto,
  divisionId,
}: {
  divisionId?: string;
  eventId: string;
  /**
   * The event's answers. MANAGE_FIXTURES and ASSIGN_COURTS are event actions,
   * the same for every row, so they ride on the event and not on each game.
   */
  can: Event["can"];
  spoiler: boolean;
  /** Optional: a schedule rendered without navigation simply offers no video. */
  goto?: (r: Route) => void;
}) {
  const games = useGames(eventId);
  const entries = useEntries(eventId);
  const visible = (games.data?.games ?? []).filter(g => {
    if (!divisionId) return true;
    const home = entries.data?.registered.find(t => t.teamId === g.homeTeamId);
    const away = entries.data?.registered.find(t => t.teamId === g.awayTeamId);
    return home?.divisionId === divisionId && away?.divisionId === divisionId;
  });
  const groups = [
    { label: m.nav_live(), games: visible.filter(g => g.statusCode === "LIVE" || g.statusCode === "HALF_TIME") },
    { label: m.status_upcoming(), games: visible.filter(g => g.statusCode === "SCHEDULED") },
    { label: m.recent_results(), games: visible.filter(g => g.statusCode === "FINISHED").toReversed() },
    { label: m.other_games(), games: visible.filter(g => !["LIVE", "HALF_TIME", "SCHEDULED", "FINISHED"].includes(g.statusCode)) },
  ];

  if (games.isPending) return <Loading />;
  if (!visible.length) {
    // Not an empty table: an event with no fixtures yet has none, and a header
    // over nothing reads as a loading state that never finishes.
    return <EmptyState data-testid="schedule-empty">{m.schedule_empty()}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="schedule">
      {groups.filter(group => group.games.length).map(group => (
        <section key={group.label}>
          <SectionHeading className="mt-0 mb-3" title={group.label} />
          <ItemGroup>
            {group.games.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                spoiler={spoiler}
                viewerZone={games.data?.viewerTimezone ?? null}
                can={can}
                eventId={eventId}
                goto={goto}
              />
            ))}
          </ItemGroup>
        </section>
      ))}
    </div>
  );
}

export function GameRow({
  game,
  spoiler,
  viewerZone,
  can,
  eventId,
  goto,
  details = false,
}: {
  details?: boolean;
  game: Game;
  spoiler: boolean;
  viewerZone: string | null;
  /** The event's answers, resolved once by the parent. */
  can: Event["can"];
  eventId: string | undefined;
  goto?: (r: Route) => void;
}) {
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const played = game.homeScore !== null && game.awayScore !== null;

  return (
    <Item variant="outline" size="sm" className="flex-wrap items-start" data-testid={`game-${game.id}`}>
      <ItemContent className="basis-full sm:basis-auto">
        <GameSummary game={game} details={details} showStatus={false} />
        <Muted as="div">
          <Can of={game} action="CONFIRM_MATCH_STATUS" fallback={
            <span
              data-testid={`game-status-${game.id}`}
              className={game.statusCode === "LIVE" ? "font-medium text-destructive" : undefined}
            >
              {game.statusLabel}
            </span>
          }><GameStatus game={game} /></Can>
          {game.timezone && viewerZone && viewerZone !== game.timezone && (
            <span data-testid={`local-time-${game.id}`}>
              {" · "}
              {m.your_time({ time: timeOf(game.startsAt, locale, viewerZone) })}
            </span>
          )}
          {/* One separator per segment. A bare " · " sat here too, so every
              row read "venue · · referee" — visible in a screenshot, invisible
              to a test that finds the referee by testid. */}
          {game.referees.length > 0 && (
            <>
              {" · "}
              <span data-testid={`referees-${game.id}`}>
                {game.referees.map((r) => r.name).join(", ")}
              </span>
            </>
          )}
        </Muted>
      </ItemContent>

      <ItemActions className="ml-auto flex-wrap justify-end">
        {editing ? (
          <Can of={game} action="ENTER_SCORES">
          <ScoreForm game={game} onDone={() => setEditing(false)} />
          </Can>
        ) : (
          <>
            <span className="min-w-[4.5rem] text-right text-base tabular-nums" data-testid={`score-${game.id}`}>
              {/* Spoiler mode hides the result, not the fixture. */}
              {spoiler && played ? m.spoiler_hidden() : played ? `${game.homeScore}–${game.awayScore}` : "—"}
            </span>
            <Can of={game} action="ASSIGN_REFEREE"><Referees game={game} /></Can>
            {/*
              Where a broadcaster actually starts.

              A referee arrives at the gym before tip-off, when their game is
              still SCHEDULED — so offering this only on the Live page, which
              lists games already in play, is offering it after the moment they
              needed it. It sits on the fixture they are standing in front of.

              And Watch appears here for everyone once a camera is on it, so
              somebody reading a schedule does not have to know a second page
              exists.
            */}
            {goto && game.isBroadcasting && (
              <ButtonLink
                data-testid={`watch-fixture-${game.id}`}
                href={routeHref({ page: "watch", id: game.id })}
              >
                {m.video_watch()}
              </ButtonLink>
            )}
            {goto && !game.isBroadcasting && (
              <Can of={game} action="BROADCAST_GAME">
              <ButtonLink
                variant="outline"
                data-testid={`broadcast-fixture-${game.id}`}
                href={routeHref({ page: "broadcast", id: game.id })}
              >
                {m.video_broadcast()}
              </ButtonLink>
              </Can>
            )}
            <Can of={game} action="ENTER_SCORES">
              <Button
                variant="outline"
                data-testid={`enter-score-${game.id}`}
                onClick={() => setEditing(true)}
              >
                {played ? m.correct_score() : m.enter_score()}
              </Button>
            </Can>
            {/* Both `games.update` and `games.remove` were enforced and
                unreachable, so a fixture entered at the wrong time stayed at
                the wrong time and a mistake could never be taken back. */}
            <Can of={{ can }} action="MANAGE_FIXTURES"><ManageFixture game={game} /></Can>
            <Can of={{ can }} action="ASSIGN_COURTS"><AssignVenue game={game} eventId={eventId} /></Can>
          </>
        )}
      </ItemActions>
      <Can of={game} action="ENTER_SCORES"><GameStats gameId={game.id} /></Can>
    </Item>
  );
}

/**
 * Rescheduling a fixture, or taking it back.
 *
 * `MANAGE_FIXTURES` is the same grant that put the game here in the first
 * place. It is EVENT-scoped, because a game that does not exist yet has no
 * relation to be in — and the right to schedule one is the right to fix one.
 *
 * ## The time is edited on the venue's clock
 *
 * `startsAt` is a UTC instant and `<input type="datetime-local">` holds a naive
 * wall-clock string, so something has to say *whose* clock. It is the venue's,
 * never the machine's: an organiser in Bangkok editing a Bangkok fixture from a
 * laptop still set to UTC would otherwise be shown a time seven hours off the
 * one printed on the schedule, change nothing, press Save, and move the game.
 * Nothing would error and nobody would notice until people turned up.
 *
 * ## Removing asks first
 *
 * It cascades: the referee rows point at the game and are deleted with it, so
 * an accidental press loses assignments as well as the fixture. The registry's
 * AlertDialog asks, in the reader's language, about a thing that cannot be
 * undone — there is no restore, because a deleted fixture is not a state the
 * model keeps.
 */
function ManageFixture({ game }: { game: Game }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const invalidate = () => refreshGameViews(qc);

  const move = useMutation({
    mutationFn: (startsAt: string) =>
      api.games.update({ id: game.id, eventId: game.eventId, startsAt }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  const drop = useMutation({
    mutationFn: () => api.games.delete({ id: game.id, eventId: game.eventId }),
    onSuccess: invalidate,
  });

  const err = formErrors(move.error, ["startsAt"]);
  const dropErr = formErrors(drop.error);

  if (!open) {
    return (
      <>
        <Button
          variant="outline"
          data-testid={`edit-fixture-${game.id}`}
          onClick={() => setOpen(true)}
        >
          {m.fixture_edit()}
        </Button>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <Button
            variant="outline"
            data-testid={`remove-fixture-${game.id}`}
            disabled={drop.isPending}
            onClick={() => setConfirming(true)}
          >
            {drop.isPending ? m.fixture_removing() : m.fixture_remove()}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.fixture_remove()}</AlertDialogTitle>
              <AlertDialogDescription>{m.fixture_confirm_remove()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.cancel()}</AlertDialogCancel>
              <AlertDialogAction
                data-testid={`confirm-remove-fixture-${game.id}`}
                onClick={() => { setConfirming(false); drop.mutate(); }}
              >
                {m.fixture_remove()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {dropErr.form && <FormAlert>{dropErr.form}</FormAlert>}
      </>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      data-testid={`fixture-form-${game.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        const local = String(new FormData(e.currentTarget).get("startsAt") ?? "");
        if (local) move.mutate(fromLocalInput(local, game.timezone));
      }}
    >
      <Label className="sr-only" htmlFor={`starts-${game.id}`}>{m.fixture_when()}</Label>
      <Input
        id={`starts-${game.id}`}
        name="startsAt"
        type="datetime-local"
        data-testid={`fixture-when-${game.id}`}
        defaultValue={toLocalInput(game.startsAt, game.timezone)}
        required
      />
      <Button type="submit" data-testid={`save-fixture-${game.id}`} disabled={move.isPending}>
        {move.isPending ? m.event_saving() : m.event_save()}
      </Button>
      <Button type="button" variant="outline" onClick={() => setOpen(false)}>
        {m.fixture_cancel()}
      </Button>
      {(err.form || err.field("startsAt")) && (
        <FormAlert data-testid={`fixture-error-${game.id}`}>
          {err.form ?? err.field("startsAt")}
        </FormAlert>
      )}
    </form>
  );
}

/**
 * Which court a fixture is on.
 *
 * `ASSIGN_COURTS` — a separate control from Edit because it is a separate
 * action in the model, and separate from it in the API for the same reason.
 *
 * It exists because `generateFixtures` writes `venueId: null`: an organiser
 * generated a thirty-one-game season and every row read "Venue TBC" with
 * nothing anywhere in the app able to change it.
 *
 * The options are the event's courts, from `eventVenue` — never every venue on
 * the platform. The endpoint refuses anything else, so offering more would be
 * offering choices that 400.
 */
function AssignVenue({ game, eventId }: { game: Game; eventId: string | undefined }) {
  const qc = useQueryClient();
  const { name } = useLocale();
  const { rows } = useEventVenues(eventId);

  const assign = useMutation({
    mutationFn: (venueId: string | null) =>
      api.games.assignVenue({ id: game.id, eventId: game.eventId, venueId }),
    onSuccess: () => refreshGameViews(qc),
  });
  const err = formErrors(assign.error);

  // Nothing to choose between: an event with no courts recorded needs a venue
  // added on the Venues tab first, and a select with one empty option is a
  // control that cannot do anything.
  if (!rows.length) return null;

  return (
    <>
      <Label className="sr-only" htmlFor={`venue-${game.id}`}>{m.assign_venue()}</Label>
      <NativeSelect
        id={`venue-${game.id}`}
        size="sm"
        data-testid={`assign-venue-${game.id}`}
        value={game.venueId ?? ""}
        disabled={assign.isPending}
        onChange={(e) => assign.mutate(e.target.value || null)}
      >
        <NativeSelectOption value="">{m.venue_unassigned()}</NativeSelectOption>
        {rows.map(({ venue }) => (
          <NativeSelectOption key={venue.id} value={venue.id}>
            {name(venue.names as Record<string, string>, venue.id)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {err.form && <FormAlert>{err.form}</FormAlert>}
    </>
  );
}

/**
 * Moving a game between upcoming, live, half-time and finished.
 *
 * A select rather than a button, because the states are not a sequence you step
 * through: a game called live by mistake has to go back, and half-time is not
 * "half of finished". The options come from the reference vocabulary, so a state
 * added to the model appears here without an edit.
 *
 * Gated on `can.CONFIRM_MATCH_STATUS`, which is its own grant, not
 * `ENTER_SCORES`. The same people hold both today and that is not this
 * component's business.
 */
function GameStatus({ game }: { game: Game }) {
  const qc = useQueryClient();
  const { terms, name } = useLocale();

  const set = useMutation({
    mutationFn: (statusCode: string) =>
      api.games.setStatus({ id: game.id, statusCode: statusCode as never }),
    onSuccess: () => refreshGameViews(qc),
  });
  const err = formErrors(set.error);

  return (
    <>
    <Label className="sr-only" htmlFor={`status-${game.id}`}>{game.homeTeam} {m.versus()} {game.awayTeam}</Label>
    <NativeSelect
      id={`status-${game.id}`}
      size="sm"
      className={game.statusCode === "LIVE" ? "font-medium text-destructive" : undefined}
      data-testid={`game-status-${game.id}`}
      value={game.statusCode}
      disabled={set.isPending}
      onChange={(e) => set.mutate(e.target.value)}
    >
      {terms("gameStatuses").map((s) => (
        <NativeSelectOption key={s.code} value={s.code}>
          {name(s.names, s.code)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
    {err.form && <FormAlert>{err.form}</FormAlert>}
    </>
  );
}

/**
 * Who officiates this game.
 *
 * `ASSIGN_REFEREE` is granted to whoever runs the event and deliberately not to
 * referees — one who could assign themselves would undo the reason score entry
 * is safe. So this control appears for an organiser and never for the official
 * standing on the court.
 */
function Referees({ game }: { game: Game }) {
  const qc = useQueryClient();
  const invalidate = () => refreshGameViews(qc);

  const assign = useMutation({
    mutationFn: (userId: string) => api.games.assignReferee({ id: game.id, userId }),
    onSuccess: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (userId: string) => api.games.unassignReferee({ id: game.id, userId }),
    onSuccess: invalidate,
  });

  const free = game.availableReferees;
  const err = formErrors(assign.error ?? unassign.error);
  const pending = assign.isPending || unassign.isPending;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid={`assign-referee-${game.id}`}>
      {game.referees.map((r) => (
        <Badge
          key={r.userId}
          variant="outline"
          render={<button type="button" disabled={pending} />}
          title={m.remove_from_squad()}
          data-testid={`unassign-${game.id}-${r.userId}`}
          onClick={() => unassign.mutate(r.userId)}
        >
          {r.name} ×
        </Badge>
      ))}
      {free.length > 0 && (
        <NativeSelect
          size="sm"
          aria-label={m.assign_referee()}
          disabled={pending}
          value=""
          data-testid={`referee-select-${game.id}`}
          onChange={(e) => e.target.value && assign.mutate(e.target.value)}
        >
          <NativeSelectOption value="">{m.assign_referee()}</NativeSelectOption>
          {free.map((c) => (
            <NativeSelectOption key={c.userId} value={c.userId}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {err.form && <FormAlert>{err.form}</FormAlert>}
    </span>
  );
}

function ScoreForm({ game, onDone }: { game: Game; onDone: () => void }) {
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (v: { homeScore: number; awayScore: number }) =>
      api.games.enterScore({ id: game.id, ...v }),
    onSuccess: () => {
      void refreshGameViews(qc);
      onDone();
    },
  });

  const scoreErr = formErrors(save.error, ["homeScore"]);

  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      data-testid={`score-form-${game.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({ homeScore: Number(f.get("home")), awayScore: Number(f.get("away")) });
      }}
    >
      <Input
        name="home"
        type="number"
        min="0"
        required
        className="w-16 text-center tabular-nums"
        defaultValue={game.homeScore ?? ""}
        aria-label={game.homeTeam}
        data-testid={`home-score-${game.id}`}
      />
      <span className="text-muted-foreground">–</span>
      <Input
        name="away"
        type="number"
        min="0"
        required
        className="w-16 text-center tabular-nums"
        defaultValue={game.awayScore ?? ""}
        aria-label={game.awayTeam}
        data-testid={`away-score-${game.id}`}
      />
      <Button type="submit" disabled={save.isPending} data-testid={`save-score-${game.id}`}>
        {save.isPending ? m.org_saving() : m.org_save()}
      </Button>
      <Button type="button" variant="outline" onClick={onDone}>
        {m.cancel()}
      </Button>
      {/* "Give both scores or neither" is a refinement across two fields, so it
          has no single home — it arrives at form level and is said once. */}
      {(scoreErr.field("homeScore") ?? scoreErr.form) && (
        <FormAlert data-testid={`score-error-${game.id}`}>
          {scoreErr.field("homeScore") ?? scoreErr.form}
        </FormAlert>
      )}
    </form>
  );
}

/**
 * Adding a fixture.
 *
 * Only for whoever runs the event — `MANAGE_FIXTURES`, which the schedule asks
 * about the event rather than about any game, because a game that does not
 * exist yet has no relation to be in.
 *
 * Teams come from the event's entries, so a fixture can only be made between
 * teams that actually entered. The API refuses anything else; offering it here
 * would be a form that teaches people to expect errors.
 */
export function AddFixture({ eventId, can, timezone }: { eventId: string; can: Event["can"]; timezone: Event["timezone"] }) {
  const qc = useQueryClient();
  const { data: entries } = useEntries(eventId);

  const add = useMutation({
    mutationFn: (v: { homeTeamId: string; awayTeamId: string; startsAt: string }) =>
      api.games.create({ eventId, ...v }),
    onSuccess: () => refreshGameViews(qc),
  });

  /**
   * The whole schedule at once, one round robin per division.
   *
   * An organiser registered fifteen teams and then typed thirty-one fixtures
   * into the form below, one at a time. It adds only the pairings that are
   * missing, so it is safe to press after entering a few by hand and safe to
   * press twice.
   */
  const generate = useMutation({
    mutationFn: (v: { startDate: string }) =>
      api.games.generateFixtures({ eventId, startDate: v.startDate }),
    onSuccess: () => refreshGameViews(qc),
  });

  const addErr = formErrors(add.error, ["startsAt"]);
  const genErr = formErrors(generate.error);
  const teams = entries?.registered ?? [];
  if (teams.length < 2) return null;

  return (
    <>
      {/* Before the one-at-a-time form, because it is the thing an organiser
          wants first and the form is what you reach for afterwards. */}
      <Can of={{ can }} action="GENERATE_FIXTURES">
      <Card>
      <CardHeader><CardTitle>{m.generate_fixtures()}</CardTitle></CardHeader>
      <CardContent>
      <form
        data-testid="generate-fixtures"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          generate.mutate({ startDate: String(f.get("startDate")) });
        }}
      >
        <FieldGroup className="max-w-[420px]">
          <Field>
            <FieldLabel htmlFor="gen-start">{m.first_matchday()}</FieldLabel>
            <Input id="gen-start" name="startDate" type="date" required data-testid="generate-start" />
          </Field>
          <Button type="submit" data-testid="generate-submit" disabled={generate.isPending} className="w-fit">
            {generate.isPending ? m.org_saving() : m.generate_fixtures()}
          </Button>
          {generate.data && (
            <Muted data-testid="generate-result">
              {m.generate_result({ created: generate.data.created, skipped: generate.data.skipped })}
            </Muted>
          )}
          {genErr.form && (
            <Alert variant="destructive" data-testid="generate-error">
              <AlertDescription>{genErr.form}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>
      </CardContent>
      </Card>
      </Can>

      <Can of={{ can }} action="MANAGE_FIXTURES">
      <Card data-testid="add-fixture">
      <CardHeader><CardTitle>{m.add_fixture()}</CardTitle></CardHeader>
      <CardContent>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          add.mutate({
            homeTeamId: String(f.get("home")),
            awayTeamId: String(f.get("away")),
            startsAt: fromLocalInput(String(f.get("startsAt")), timezone),
          });
        }}
      >
        <FieldGroup className="max-w-[420px]">
          <Field>
            <FieldLabel htmlFor="fixture-home">{m.home_team()}</FieldLabel>
            <NativeSelect id="fixture-home" name="home" data-testid="fixture-home">
              {teams.map((t) => (
                <NativeSelectOption key={t.teamId} value={t.teamId}>{t.team}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="fixture-away">{m.away()}</FieldLabel>
            <NativeSelect id="fixture-away" name="away" data-testid="fixture-away" defaultValue={teams[1]!.teamId}>
              {teams.map((t) => (
                <NativeSelectOption key={t.teamId} value={t.teamId}>{t.team}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={!!addErr.field("startsAt") || undefined}>
            <FieldLabel htmlFor="fixture-starts">{m.fixture_when()} {timezone}</FieldLabel>
            <Input id="fixture-starts" name="startsAt" type="datetime-local" required data-testid="fixture-starts" />
            {addErr.field("startsAt") && (
              <FieldError data-testid="fixture-starts-issue">
                {addErr.field("startsAt")}
              </FieldError>
            )}
          </Field>
          <Button type="submit" data-testid="add-fixture-submit" disabled={add.isPending} className="w-fit">
            {add.isPending ? m.org_saving() : m.add_fixture()}
          </Button>
          {/* A refusal with no field to sit under — "that team is not registered
              for this event", "a team cannot play itself", "those teams are in
              different divisions" — plus any issue the fields above did not
              claim. Those belong at the bottom of the form, not beneath an input
              that is not the problem. */}
          {addErr.form && (
            <Alert variant="destructive" data-testid="add-fixture-error">
              <AlertDescription>{addErr.form}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>
      </CardContent>
      </Card>
      </Can>
    </>
  );
}
