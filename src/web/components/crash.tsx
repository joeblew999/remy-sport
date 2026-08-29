/**
 * What a person sees when the app breaks, and what we learn from it.
 *
 * There was nothing here before: a React render error unmounted the tree and
 * left a white rectangle. No message, no way back except knowing to reload, and
 * — worse — no report. The failure that takes the whole page away was the one
 * failure the system could not see, so every other kind of telemetry was better
 * instrumented than the worst kind.
 *
 * **It is used twice**, and that is not belt-and-braces. The inner one sits
 * inside LocaleProvider so its message is in the reader's language. But a
 * boundary cannot catch a throw from a component *above* it, and the provider
 * renders above — so an error there took the page out with nothing to catch it.
 * The outer one has no provider to depend on and no translation, which is why
 * `untranslated` exists: English is a poor answer and a white screen is no
 * answer.
 *
 * Three things are deliberate.
 *
 * **The message says whose fault it is.** "Something in the app broke, not your
 * connection" stops the reader debugging their wifi, which is what a blank page
 * teaches them to do.
 *
 * **There is a button.** Telling someone to reload is not the same as letting
 * them, particularly on a phone where the address bar is hidden.
 *
 * **It reports before it renders.** `componentDidCatch` fires once per error;
 * the beacon goes out there rather than in a click handler, because most people
 * never click anything — they close the tab.
 */

import { Component, type ErrorInfo, type ReactNode } from "react"
import { m } from "../lib/i18n"
import { reportClientError } from "../lib/report"

interface Props {
  children: ReactNode
  /**
   * Render without translating.
   *
   * The outermost boundary sits *above* LocaleProvider, so it cannot call `m.*`
   * — the provider it would need may be the thing that just threw. English
   * then, which is the honest trade: a message in one language beats a white
   * rectangle in every language.
   */
  untranslated?: boolean
}

interface State {
  failed: boolean
}

export class CrashBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError(error, {
      // The first line of the component stack: which component threw, not the
      // whole tree. The full stack is minified in production and would be a
      // hundred characters of `t`, `n`, `o` — high cardinality, no meaning.
      where: (info.componentStack ?? "").trim().split("\n")[0]?.trim().slice(0, 120) ?? "",
    })
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const text = this.props.untranslated
      ? {
          title: "This page stopped working",
          body: "Something in the app broke, not your connection. Reloading usually fixes it, and we have been told what happened.",
          reload: "Reload the page",
        }
      : { title: m.crash_title(), body: m.crash_body(), reload: m.crash_reload() }
    return (
      <div className="crash" role="alert" data-testid="crash">
        <h1>{text.title}</h1>
        <p>{text.body}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          {text.reload}
        </button>
      </div>
    )
  }
}
