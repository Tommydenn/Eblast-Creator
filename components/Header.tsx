import Link from "next/link";

export interface HeaderProps {
  /** The currently active section, used for nav highlighting. */
  active?: "drafter" | "communities";
}

/**
 * Top-of-page navigation. Brand mark + nav + (slot for actions in the future).
 * Used on every page so the app feels like one product, not three pages.
 */
export function Header({ active }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/60 bg-white/80 backdrop-blur-xl shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest-600 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
            E
          </span>
          <span className="text-sm font-semibold text-sand-900 group-hover:text-forest-700 transition-colors">
            Eblast Drafter
          </span>
          <span className="ml-0.5 hidden rounded-md border border-sand-200 bg-sand-50 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-sand-500 sm:inline-block">
            GLM
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/" active={active === "drafter"}>
            Drafter
          </NavLink>
          <NavLink href="/communities" active={active === "communities"}>
            Communities
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? "bg-forest-600 text-white shadow-sm"
          : "text-sand-600 hover:text-sand-900 hover:bg-sand-100"
      }`}
    >
      {children}
    </Link>
  );
}
