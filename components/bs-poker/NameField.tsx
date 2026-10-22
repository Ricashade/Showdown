"use client";

import { useEffect, useState } from "react";

const NAME_KEY = "showdown:name";

/** Your last-used name, remembered on this device as a convenience. */
export function useRememberedName() {
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      // Storage blocked: start empty.
    }
  }, []);
  return [name, setName] as const;
}

export function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // Not critical.
  }
}

export function NameField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-base text-bone">
        Your name
      </label>
      <input
        id={id}
        value={value}
        maxLength={20}
        autoComplete="nickname"
        onChange={(e) => onChange(e.target.value)}
        placeholder="What the table calls you"
        className="mt-1.5 min-h-12 w-full rounded-2xl bg-smoke px-4 text-lg text-bone ring-1 ring-leather-lit placeholder:text-ash focus-visible:outline-2 focus-visible:outline-brass-lit"
      />
    </div>
  );
}
