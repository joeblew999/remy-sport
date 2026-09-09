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
import { Fragment, createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
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

/**
 * The page's name, so the site header can render it.
 *
 * shadcn's `dashboard-01` puts the page title in the header bar beside the
 * sidebar trigger — `<h1 class="text-base font-medium">` — not in a band of its
 * own below it. Adopting that shell (the Product Owner, 2026-09-09) means the
 * title has to travel from the page, which renders inside the bar, up to the
 * header, which renders outside it. Hence a context rather than a prop: no page
 * changes, and `PageHeader` keeps the API thirteen screens already call.
 *
 * The title is a `ReactNode` because two pages compose one (a crest beside a
 * name). Cleared on unmount so a route with no `PageHeader` does not inherit
 * the last page's name.
 */
export interface Trail {
  /** Where this page hangs: its ancestors, each linked. Empty at the top. */
  crumbs: Crumb[];
  /** Where you are. The bar renders it as the page's one `h1`. */
  title: ReactNode;
}
const PageTitle = createContext<((t: Trail | null) => void) | null>(null);
const PageTitleValue = createContext<Trail | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<Trail | null>(null);
  return (
    <PageTitle.Provider value={setTitle}>
      <PageTitleValue.Provider value={title}>{children}</PageTitleValue.Provider>
    </PageTitle.Provider>
  );
}

/** Where you are and how you got here. Rendered by the site header. */
export function usePageTitle(): Trail | null {
  return useContext(PageTitleValue);
}

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
  /**
   * The name goes to the site header, not into an `h1` here.
   *
   * That is the shell shadcn's own block draws, adopted 2026-09-09. What stays
   * is everything the bar has no room for and this app genuinely uses: the
   * crumbs, the one-line description, a crest to the left, a record to the
   * right, and the page's action row.
   */
  const setTitle = useContext(PageTitle);
  const trail = JSON.stringify(crumbs?.map((c) => [c.href, c.testId]) ?? []);
  useEffect(() => {
    setTitle?.({ crumbs: crumbs ?? [], title });
    return () => setTitle?.(null);
    // `trail` stands in for `crumbs`, which is a fresh array every render.
  }, [setTitle, title, trail]); // eslint-disable-line react-hooks/exhaustive-deps

  // The name and the trail are both the bar's now; this band draws neither.
  if (!aside && !media && !extra && !sub && !children) return null;
  return (
    <header className={cn("border-b px-4 py-4 lg:px-6", className)} {...props}>
      {aside && <div className="flex flex-wrap items-center gap-3">{aside}</div>}
      <div className={cn("flex flex-wrap items-start gap-4", aside && "mt-2")}>
        {media}
        {/*
          The name is in the bar and only there.

          It was rendered here as well for a moment, so a team page would still
          name its subject beside the crest. That is wrong for a mechanical
          reason worth writing down: pages pass a *node* as the title —
          `<span data-testid="team-name">` — so drawing it twice puts the same
          test id in the document twice, and every strict-mode locator in the
          render tier resolves to two elements. 217 checks failed on it at once.

          A page that needs its subject named in the content should say so with
          its own element, not by having the frame print the title again.
        */}
        <div className="min-w-0 flex-1" data-testid="page-intro">
          {sub && (
            <p className={cn("text-muted-foreground", subLang === "th" && "font-thai")}>{sub}</p>
          )}
          {children}
        </div>
        {extra}
      </div>
    </header>
  );
}

/**
 * The content column: the block's gutters, and its container.
 *
 * `px-4 lg:px-6` and full width are `dashboard-01`'s, replacing our
 * `max-w-7xl` with `sm:px-8`. `@container/main` is the block's too: it sizes
 * content against the pane it is in rather than the window, which is what makes
 * a layout behave the same whether the sidebar is open or collapsed.
 */
export function PageInner({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("@container/main w-full px-4 py-4 pb-16 lg:px-6", className)} {...props} />
  );
}

/** A row that opens something: the registry's Item as a link, with a chevron. */
export function LinkRow({ href, title, children, ...props }: { href: string; title: ReactNode; children?: ReactNode; "data-testid"?: string }) {
  return (
    <Item variant="outline" size="sm" render={<a href={href} />} {...props}>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {children}
      </ItemContent>
      <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
    </Item>
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
 * docs/done/2026-09-09-07-main-content-on-the-registry.md.
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
 * A secondary line: the description scale, muted.
 *
 * `text-sm text-muted-foreground` was written 28 times and `text-xs
 * text-muted-foreground` 4 more — the same role at two sizes, which is the
 * drift this ends. The size is `ItemDescription`'s, so a caption beside a list
 * reads as part of it.
 *
 * `as` because the callers are 14 paragraphs, 11 spans and 6 divs, and a
 * caption inside a sentence must not become a block. Inside a `Row` or a
 * `Card`, prefer `ItemDescription` or `CardDescription`: they are the
 * registry's own and carry the same scale.
 */
export function Muted<T extends "p" | "span" | "div" = "p">({
  as,
  className,
  ...props
}: { as?: T } & ComponentProps<T>) {
  const Tag = (as ?? "p") as "p";
  return <Tag className={cn("text-sm text-muted-foreground", className)} {...(props as ComponentProps<"p">)} />;
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
