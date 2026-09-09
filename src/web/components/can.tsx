import type { ReactNode } from "react";
import { useCan } from "../lib/data";

/** A navigation group is available when at least one of its actions is granted. */
export function canAny<C extends Record<string, boolean>>(
  of: { can: C } | null | undefined,
  ...actions: (keyof NoInfer<C> & string)[]
): boolean {
  return actions.some(action => of?.can[action] === true);
}

/**
 * Render an action only when its resource's current server answer permits it.
 * The form belongs inside this gate too: permission can change while it is open.
 * Unknown answers fail closed. Presentation state stays with the caller, and
 * the API still authorizes every write independently of this cached answer.
 */
export function Can<C extends Record<string, boolean>>({
  of,
  action,
  children,
  fallback = null,
}: {
  of: { can: C } | null | undefined;
  action: keyof NoInfer<C> & string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (of?.can[action] !== true) return fallback;
  return <div style={{ display: "contents" }} data-action={action}>{children}</div>;
}

/** Platform actions use the same gate, with the answer from the current session. */
export function PlatformCan({ action, children, fallback }: {
  action: Parameters<typeof useCan>[0]; children: ReactNode; fallback?: ReactNode;
}) {
  const { data } = useCan(action);
  const can: Record<string, boolean> = { [action]: data };
  return <Can of={{ can }} action={action} fallback={fallback}>{children}</Can>;
}
