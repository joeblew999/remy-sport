/**
 * "This is not real." Said once, in one place, for every fixture-backed screen.
 *
 * AGENTS.md: *never invent a value for a field with no table — render `—` or
 * "Venue TBC", and label a fixture-backed section beside real data as
 * SAMPLE DATA.* Three surfaces broke that rule and one kept it, which is the
 * usual shape of a rule with no component behind it:
 *
 *   live.tsx      the whole page — `useLiveGame()` returns a constant
 *   bracket.tsx   the whole tab  — `useBracket()` returns a constant
 *   profile.tsx   the feed       — `useFeed()` returns a constant
 *
 * The live page was the one that mattered. Deployed and public, it renders a
 * "● LIVE" badge, "412 watching", and a 54–49 scoreline for a game that does not
 * exist, with nothing to say so. A visitor could not tell it from the real
 * thing, and the fixtures are convincing precisely because somebody wrote them
 * to look like a real Bangkok schools quarterfinal.
 *
 * A banner rather than the small `SAMPLE DATA` chip `team.tsx` uses beside its
 * heading: that chip is right when a fixture section sits *beside* real data and
 * has to say which half is which. Here the whole screen is the fixture, and a
 * chip in a corner is not a warning, it is a footnote.
 *
 * Each of these disappears when its endpoint lands — see the note above
 * `useBracket` in lib/data.tsx. Deleting the fixture deletes the banner with it.
 */
import { m } from "../lib/i18n";

export function SampleData({ inline = false }: { inline?: boolean }) {
  return (
    <div
      className={`sample-banner${inline ? " inline" : ""}`}
      data-testid="sample-data"
      role="note"
    >
      <strong>{m.sample_data()}</strong>
      <span>{m.sample_data_note()}</span>
    </div>
  );
}
