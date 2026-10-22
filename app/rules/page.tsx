import type { Metadata } from "next";
import Link from "next/link";
import { CornerNav } from "@/components/rules/CornerNav";
import { RulesTabs } from "@/components/rules/RulesTabs";

export const metadata: Metadata = { title: "How to play BS Poker | Showdown" };

export default function RulesPage() {
  return (
    <>
      <CornerNav links={[{ href: "/", label: "Back to menu" }]} />
      <main className="mx-auto max-w-5xl px-4 pt-24 pb-16 sm:px-8">
        <h1 className="font-display text-6xl font-extrabold text-bone sm:text-7xl">How to play BS Poker</h1>
        <p className="mt-3 max-w-prose text-lg text-parchment">
          A bluffing game played with poker hands. Five short sections, or watch a single round play out.
        </p>
        <Link
          href="/rules/demo"
          className="felt mt-7 inline-flex min-h-14 items-center rounded-full px-7 font-display text-2xl font-bold text-bone transition hover:brightness-110"
        >
          Try the 30-second demo
        </Link>
        <div className="mt-12">
          <RulesTabs />
        </div>
      </main>
    </>
  );
}
