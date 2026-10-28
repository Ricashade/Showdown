"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { ROOM, ROOM_PATH } from "@/lib/games";
import { createSession } from "@/lib/multiplayer/session";
import { isRoomCode, normalizeRoomCode } from "@/lib/multiplayer/room-code";
import { NameField, rememberName, useRememberedName } from "@/components/bs-poker/NameField";

/** Name and room code, then straight to the table (whichever game the host has on). */
export function JoinWithCode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useRememberedName();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const ok = name.trim().length > 0 && isRoomCode(code);

  useEffect(() => {
    codeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const join = async () => {
    if (!ok) return;
    setBusy(true);
    rememberName(name);
    await createSession(ROOM.roomKey(code), code, name, "guest");
    router.push(`${ROOM_PATH}/${code}`);
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
        className="felt w-full max-w-md rounded-[2rem] p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="join-title" className="font-display text-4xl font-extrabold text-bone">
            Join a room
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full text-bone hover:bg-black/25">
            <X className="size-5" />
          </button>
        </div>

        <label htmlFor="join-code" className="mt-5 block text-base text-bone">
          Room code
        </label>
        <input
          ref={codeRef}
          id="join-code"
          value={code}
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABCD"
          className="mt-1.5 min-h-14 w-full rounded-2xl bg-baize-deep px-4 font-display text-4xl font-bold tracking-[0.3em] text-bone uppercase ring-1 ring-bone/30 placeholder:text-bone/40 focus-visible:outline-2 focus-visible:outline-brass-lit"
        />
        <div className="mt-4">
          <NameField value={name} onChange={setName} id="join-name" />
        </div>

        <button
          disabled={!ok || busy}
          className="mt-6 min-h-12 w-full rounded-full bg-brass font-display text-2xl font-bold text-smoke transition hover:bg-brass-lit disabled:opacity-40"
        >
          {busy ? "Joining…" : "Take a seat"}
        </button>
      </form>
    </motion.div>
  );
}
