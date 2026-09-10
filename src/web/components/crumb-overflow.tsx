import type { ReactNode } from "react";
import { BreadcrumbEllipsis } from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "../lib/i18n";

/**
 * The ancestors, on a screen too narrow to lay them out.
 *
 * They used to be `hidden sm:inline-flex` — removed below 640px rather than
 * collapsed — so on a 390px phone the hierarchy was not on screen at all. That
 * is the width this product is mostly read at, and installing takes the
 * browser's own Back away on top of it.
 *
 * The registry's `breadcrumb-responsive` is the sanctioned answer and it
 * **collapses**: the ancestors move behind a `BreadcrumbEllipsis` that opens a
 * menu, rather than disappearing. This is that, with one deviation stated
 * rather than hidden — the registry example opens a Drawer on mobile and a
 * DropdownMenu on desktop. `drawer` is not installed here and `dropdown-menu`
 * is, already used by the sidebar's account control, so adding a registry
 * component for one trigger buys nothing. Touch is covered by the app's own
 * 44px control height rather than by the overlay's shape.
 *
 * This is the *hierarchy*. The way **back** is a separate control, because a
 * crumb leads to a team's parent and Back leads to the schedule the reader
 * actually came from — see `back-control.tsx`.
 *
 * docs/done/2026-09-09-10-installed-app-back-navigation.md.
 */
export function CrumbOverflow({ children }: { children: ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-11 shrink-0 items-center justify-center sm:hidden"
        aria-label={m.breadcrumbs()}
        data-testid="crumb-overflow"
      >
        <BreadcrumbEllipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {/*
          The link is the child rather than the item itself. Base UI's MenuItem
          takes no `asChild`, and wrapping keeps the item's own keyboard and
          focus behaviour instead of reimplementing it on an anchor.
        */}
        {children.map((step, i) => (
          <DropdownMenuItem key={i}>{step}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
