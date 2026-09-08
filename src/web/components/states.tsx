/**
 * "Nothing here" and "not yet", from the registry's Empty and Spinner.
 *
 * Thirty places rendered the same dashed box by class; these are the four
 * nested registry tags those places share. The Spinner ships an English
 * `aria-label` inside its locked file, so the label is passed in.
 */
import type { ComponentProps } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { m } from "../lib/i18n";

export function EmptyState({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <Empty className={cn("border", className)} {...props}>
      <EmptyHeader>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function Loading({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <Empty className={cn("border", className)} {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner aria-label={m.loading()} />
        </EmptyMedia>
        <EmptyDescription>{children ?? m.loading()}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
