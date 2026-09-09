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
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
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
  /** For a spec that follows the crumb back. */
  testId?: string;
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
                  <BreadcrumbLink href={item.href} data-testid={item.testId}>{item.label}</BreadcrumbLink>
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
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
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

/**
 * A dense list: one bordered box with divided rows, instead of the registry's
 * spaced cards.
 *
 * `ItemGroup` ships `gap-4` — separate cards — and shadcn has no divided-list
 * variant. This app needs one: a schedule or a squad is twenty rows read at
 * courtside on a phone, and twenty cards is a page of scrolling. So the pattern
 * was written inline, the same five classes, twenty-two times across nineteen
 * files, every copy free to drift from the others. This is that pattern said
 * once. The registry's own file is locked (tests/repo/registry.test.ts), which
 * is why the variant lives here rather than in `Item`.
 *
 * Nothing else is ours. The rows keep `Item`'s padding, text size, weight and
 * hover exactly as the registry ships them, which is what makes a list read
 * like the sidebar rather than like a page that decided for itself.
 * docs/2026-09-09-07-main-content-on-the-registry.md.
 */
export function RowGroup({
  boxed = true,
  className,
  ...props
}: { boxed?: boolean } & ComponentProps<typeof ItemGroup>) {
  return (
    <ItemGroup
      className={cn("gap-0 divide-y", boxed && "overflow-hidden rounded-xl border", className)}
      {...props}
    />
  );
}

/** One row of a `RowGroup`: the registry's Item, minus the radius the box supplies. */
export function Row({ className, ...props }: ComponentProps<typeof Item>) {
  return <Item className={cn("rounded-none", className)} {...props} />;
}

/** A row that opens something: a `Row` as a link, with a chevron. */
export function LinkRow({ href, title, children, ...props }: { href: string; title: ReactNode; children?: ReactNode; "data-testid"?: string }) {
  return (
    <Row render={<a href={href} />} {...props}>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {children}
      </ItemContent>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </Row>
  );
}

/**
 * The heading ladder, in one place, on the registry's own scale.
 *
 * shadcn ships no page-header item, so the sizes below are the one genuine
 * design decision in this file — everything else defers to a registry
 * component. They are chosen to continue the registry's ladder rather than to
 * start a second one:
 *
 *   page title  h1  text-2xl / 3xl   ours, the only thing bigger than a panel
 *   section     h2  text-lg          one step above a panel title
 *   panel       h3  text-base        exactly CardTitle
 *   row             text-sm          exactly ItemTitle
 *
 * Two things come from the registry and are not ours to pick. `font-heading` is
 * the preset's own heading token, which card, alert-dialog, sheet and empty all
 * use. And the weight is `font-medium`, not the `font-semibold` this app had
 * reached for: every title the registry ships is medium, and a page of
 * semibold headings beside a sidebar of medium ones is most of why the two
 * halves did not look like one app.
 * docs/2026-09-09-07-main-content-on-the-registry.md.
 */
export function SectionHeading({
  title,
  className,
  children,
  ...props
}: { title: ReactNode } & Omit<ComponentProps<"div">, "title">) {
  return (
    <div className={cn("mt-8 mb-3 flex items-baseline justify-between gap-3", className)} {...props}>
      <h2 className="font-heading text-lg font-medium tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

/**
 * A heading inside a panel or a section: `CardTitle`'s scale, as an `h3`.
 *
 * The same three words were written seven times at three different sizes —
 * `text-base font-semibold`, `text-sm font-semibold`, `text-xl font-semibold` —
 * which is the drift this exists to end.
 */
export function SubHeading({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("font-heading text-base leading-snug font-medium", className)} {...props} />;
}
