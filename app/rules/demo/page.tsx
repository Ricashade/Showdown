import type { Metadata } from "next";
import { CornerNav } from "@/components/rules/CornerNav";
import { QuickDemo } from "@/components/rules/QuickDemo";

export const metadata: Metadata = { title: "30-second demo | BS Poker" };

export default function DemoPage() {
  return (
    <>
      <CornerNav
        links={[
          { href: "/rules", label: "Exit demo", primary: true },
          { href: "/", label: "Back to menu" },
        ]}
      />
      <main>
        <QuickDemo />
      </main>
    </>
  );
}
