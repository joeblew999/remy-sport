/**
 * A status as the registry's Badge, in the registry's variants.
 *
 * Live is the destructive tint (the one red the theme has), open the primary,
 * upcoming the quiet secondary, finished and closed the outline. Both the
 * event statuses (`live`, `upcoming`, …) and the game status codes (`LIVE`,
 * `SCHEDULED`, …) resolve here, so one map decides the colour everywhere.
 */
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";

type Variant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const VARIANT: Record<string, Variant> = {
  live: "destructive",
  LIVE: "destructive",
  HALF_TIME: "destructive",
  open: "default",
  upcoming: "secondary",
  SCHEDULED: "secondary",
  closed: "outline",
  FINISHED: "outline",
};

export function StatusBadge({
  status,
  ...props
}: { status: string } & Omit<ComponentProps<typeof Badge>, "variant">) {
  return <Badge variant={VARIANT[status] ?? "outline"} {...props} />;
}
