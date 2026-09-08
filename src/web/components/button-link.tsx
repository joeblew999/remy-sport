import React from "react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A link that is dressed as a button, at the app's touch size.
 *
 * Base UI's Button is the wrong tool for this and says so itself: it enforces
 * `role="button"` on whatever it renders, and its docs tell you to style the
 * `<a>` directly when a link should look like a button. A route link that
 * announces itself as a button is read by a screen reader as an action that
 * does something in place, then navigates anyway — and Playwright's
 * `getByRole("link")` finds nothing, which is how this was caught.
 *
 * `min-h-11` is the 44px control height (`--control-height` in styles.css,
 * which holds every control to it for a thumb at courtside). The registry's
 * variants alone are 32px — a desktop measurement — and the anchor, not being
 * the registry's Button, carries no `data-slot` for the stylesheet's
 * min-height rule to find. The class here is that rule, said once.
 */
export function ButtonLink({ variant, className, ...props }: React.ComponentProps<"a"> & { variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link" }) {
  return <a className={cn(buttonVariants({ variant }), "min-h-11", className)} {...props} />
}
