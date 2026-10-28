"use client";

import { HowToDialog } from "./HowToDialog";
import { QuickDemo } from "./QuickDemo";
import { RulesTabs } from "./RulesTabs";

/** BS Poker's rules and demo in a dialog, for places you can't leave (an online room). */
export function BsPokerHowTo({ onClose }: { onClose: () => void }) {
  return (
    <HowToDialog
      title="How to play BS Poker"
      guide={(showDemo) => (
        <>
          <button onClick={showDemo} className="mb-6 min-h-11 rounded-full bg-brass px-5 text-base font-bold text-smoke hover:bg-brass-lit">
            Try the 30-second demo
          </button>
          <RulesTabs />
        </>
      )}
      demo={(exit) => <QuickDemo onExit={exit} />}
      onClose={onClose}
    />
  );
}
