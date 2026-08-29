/**
 * JSX for the MoQ custom elements, and the relay config on `window`.
 *
 * The packages declare `HTMLElementTagNameMap` — which is what `querySelector`
 * reads — but not `JSX.IntrinsicElements`, which is what TSX reads. Without
 * this every `<moq-watch>` in a .tsx file is a compile error, and the fix is not
 * discoverable from the error message.
 */

import type { MoqConfig } from "./lib/moq"

type MoqElementProps = {
  /** The relay URL, token included. Cloudflare takes it in the path. */
  url?: string
  /**
   * The broadcast. **`name`, not `path`** — verified in the shipped 0.4.5
   * element, where `"path"` appears zero times. Older posts show `path=` and
   * are wrong for this version.
   */
  name?: string
  muted?: boolean
  invisible?: boolean
  source?: string
  preview?: boolean
  /** `"source"` so it does not advertise before camera permission is granted. */
  announce?: string
  ref?: React.Ref<HTMLElement>
  className?: string
  style?: React.CSSProperties
}

declare global {
  interface Window {
    MOQ?: MoqConfig
  }

  /**
   * `React.JSX`, not the global `JSX` namespace.
   *
   * React 19 moved its intrinsic elements under its own namespace, and
   * augmenting the global one compiles cleanly while doing nothing at all —
   * every `<moq-watch>` stays an error with a message that points at the
   * element rather than at this file.
   */
  namespace React.JSX {
    interface IntrinsicElements {
      "moq-watch": MoqElementProps
      "moq-publish": MoqElementProps
      /** Ready-made banner; appears only when a required feature is missing. */
      "moq-watch-support": { show?: string; className?: string }
      "moq-publish-support": { show?: string; className?: string }
    }
  }
}

export {}
