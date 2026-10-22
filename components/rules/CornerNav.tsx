import Link from "next/link";

/** Always-visible way out, pinned to the top-right corner. */
export function CornerNav({ links }: { links: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <nav aria-label="Leave" className="fixed top-4 right-4 z-50 flex gap-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            l.primary
              ? "flex min-h-11 items-center rounded-full bg-bone px-5 text-base font-bold text-smoke shadow-lg hover:bg-parchment"
              : "flex min-h-11 items-center rounded-full bg-smoke-raised px-5 text-base font-bold text-bone shadow-lg ring-1 ring-leather-lit hover:ring-brass"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
