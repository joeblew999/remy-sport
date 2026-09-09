import type MoqWatch from "@moq/watch/element"

/** React 19 JSX, backed by the installed element's public property types. */
declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      "moq-watch": {
        key?: React.Key
        url?: string
        name?: string
        muted?: MoqWatch["muted"]
        ref?: React.Ref<MoqWatch>
        children?: React.ReactNode
      }
    }
  }
}
export {}
