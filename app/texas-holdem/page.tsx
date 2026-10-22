import Link from "next/link";

export default function TexasHoldemPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-4 sm:px-8">
      <h1 className="font-display text-6xl font-extrabold text-bone">Texas Hold&apos;em</h1>
      <p className="text-lg text-parchment">This table opens in phase 2.</p>
      <Link href="/" className="text-base font-bold text-brass-lit underline underline-offset-4">
        Back to the main menu
      </Link>
    </main>
  );
}
