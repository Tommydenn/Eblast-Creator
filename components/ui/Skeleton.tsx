/**
 * The shape of a page, shown while the page itself is still being built.
 *
 * These exist so clicking a tab opens it. Every section here is rendered
 * against Postgres on demand — the community list, the approval count, the
 * events and whatever Further says about them — and none of that can start
 * until the click happens. Next can serve this instantly instead, and does:
 * a route with a loading file is the one thing it will prefetch for a
 * dynamic page, so the frame is usually already in the browser before the
 * tab is clicked, and the content lands under it when it is ready.
 *
 * The shapes are rough on purpose. A skeleton that promises an exact layout
 * and then shifts when the real thing arrives is worse than one that only
 * says "a page is coming", because the eye has already started reading it.
 */

export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-sand-200/70 ${className}`} />;
}

export function Card({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl border border-sand-200 bg-white ${className}`} />
  );
}

/** The title block every section opens with. */
export function PageHeadSkeleton() {
  return (
    <div className="mb-8">
      <Bar className="h-2.5 w-28" />
      <Bar className="mt-3 h-7 w-56" />
      <Bar className="mt-3 h-3 w-72" />
    </div>
  );
}
