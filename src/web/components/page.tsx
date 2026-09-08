/**
 * The page frame, composed from the registry.
 *
 * shadcn has no "page header" item — its blocks write one in JSX from
 * Breadcrumb, a heading and utilities — so this is that JSX, said once
 * instead of on thirteen pages. Nothing here is a rule of its own: the crumbs
 * are the registry's Breadcrumb, the widths and gutters are Tailwind's scale,
 * and the heading is the base heading style.
 *
 * The Breadcrumb ships `aria-label="breadcrumb"` in English inside its locked
 * file; the label is passed in as a message here, which is the rule for every
 * registry component that carries a word of its own.
 */
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { m } from "../lib/i18n";

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export function Crumbs({ items, ...props }: { items: Crumb[] } & ComponentProps<typeof Breadcrumb>) {
  return (
    <Breadcrumb aria-label={m.breadcrumbs()} {...props}>
      <BreadcrumbList>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {item.href ? (
                  <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                ) : last ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <span>{item.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * The top of a page: crumbs, an optional badge beside them, the title, one
 * line under it, and whatever the page adds (a status, an action row).
 * `media` sits left of the title (a team's crest), `extra` right of it (a
 * team's record). `subLang="th"` sets the Thai-first face for a line that
 * is Thai with a Latin word or two in it.
 */
export function PageHeader({
  crumbs,
  aside,
  media,
  extra,
  title,
  sub,
  subLang,
  className,
  children,
  ...props
}: {
  crumbs?: Crumb[];
  aside?: ReactNode;
  media?: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  subLang?: "th";
} & Omit<ComponentProps<"header">, "title">) {
  return (
    <header className={cn("border-b px-4 py-5 sm:px-8 sm:py-6", className)} {...props}>
      <div className="mx-auto w-full max-w-7xl">
        {(crumbs || aside) && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {crumbs && <Crumbs items={crumbs} />}
            {aside}
          </div>
        )}
        <div className="flex flex-wrap items-start gap-4">
          {media}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            {sub && (
              <p className={cn("mt-1.5 text-muted-foreground", subLang === "th" && "font-thai")}>{sub}</p>
            )}
            {children}
          </div>
          {extra}
        </div>
      </div>
    </header>
  );
}

/** The content column: one width, one gutter, at every size. */
export function PageInner({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 py-6 pb-16 sm:px-8", className)} {...props} />
  );
}

/** A row that opens something: the registry's Item as a link, with a chevron. */
export function LinkRow({ href, title, children, ...props }: { href: string; title: ReactNode; children?: ReactNode; "data-testid"?: string }) {
  return (
    <Item className="rounded-none px-4 py-3" render={<a href={href} />} {...props}>
      <ItemContent>
        <ItemTitle className="text-base">{title}</ItemTitle>
        {children}
      </ItemContent>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </Item>
  );
}

/** A section title with room for a "more" link or a control beside it. */
export function SectionHeading({
  title,
  className,
  children,
  ...props
}: { title: ReactNode } & Omit<ComponentProps<"div">, "title">) {
  return (
    <div className={cn("mt-8 mb-3 flex items-baseline justify-between gap-3", className)} {...props}>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}
