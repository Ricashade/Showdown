import Link from "next/link";

const secondary =
  "flex min-h-12 items-center rounded-full border-2 border-bone/60 px-6 text-base font-bold text-bone transition hover:border-bone";

export default function MainMenu() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16 sm:px-8">
      <h1 className="font-display text-7xl leading-[0.85] font-extrabold tracking-tight text-bone sm:text-[9rem]">
        Showdown
      </h1>

      <ul className="mt-14 space-y-4">
        <li className="felt rounded-[2rem] px-7 py-6 sm:px-9 sm:py-7">
          <h2 className="font-display text-4xl font-bold text-bone">BS Poker</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/bs-poker"
              className="flex min-h-12 items-center rounded-full bg-brass px-7 font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit"
            >
              Open a table
            </Link>
            <Link href="/rules" className={secondary}>
              Rules
            </Link>
            <Link href="/rules/demo" className={secondary}>
              Watch demo
            </Link>
          </div>
        </li>
        <li className="rounded-[2rem] border border-leather-lit px-7 py-6 sm:px-9">
          <h2 className="font-display text-4xl font-bold text-parchment">Texas Hold&apos;em</h2>
          <p className="mt-2 text-base text-ash">Coming in phase 2.</p>
        </li>
      </ul>
    </main>
  );
}
