"use client";

import { useId } from "react";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={clsx("flex items-start justify-between gap-4", disabled && "opacity-50")}>
      <label htmlFor={id} className={clsx(!disabled && "cursor-pointer")}>
        <span className="block text-base text-bone">{label}</span>
        {description && <span className="block text-sm text-ash">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition",
          checked ? "bg-brass" : "bg-leather-lit",
        )}
      >
        <span
          className={clsx(
            "absolute top-1 left-1 size-5 rounded-full bg-bone shadow transition",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  description,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const btn =
    "grid size-10 place-items-center rounded-full border border-leather-lit text-parchment transition hover:border-brass hover:text-bone disabled:opacity-35 disabled:hover:border-leather-lit";
  return (
    <div className={clsx("flex items-center justify-between gap-4", disabled && "opacity-50")}>
      <span>
        <span className="block text-base text-bone">{label}</span>
        {description && <span className="block text-sm text-ash">{description}</span>}
      </span>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" className={btn} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="size-4" />
        </button>
        <output className="w-7 text-center font-display text-2xl font-bold text-bone tabular-nums" aria-live="polite">
          {value}
        </output>
        <button type="button" className={btn} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-smoke p-1 ring-1 ring-leather-lit">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            "min-h-10 rounded-full px-3 text-sm font-bold transition",
            value === o.value ? "bg-brass text-smoke" : "text-parchment hover:text-bone",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Steps through a fixed list of values (chip amounts, blind levels…). */
export function ChoiceStepper({
  value,
  options,
  onChange,
  label,
  format = (v) => v.toLocaleString("en-US"),
  disabled,
}: {
  value: number;
  options: readonly number[];
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  // If the value isn't one of the choices, step from the nearest one.
  const index = options.reduce((best, o, i) => (Math.abs(o - value) < Math.abs(options[best] - value) ? i : best), 0);
  const btn =
    "grid size-10 place-items-center rounded-full border border-leather-lit text-parchment transition hover:border-brass hover:text-bone disabled:opacity-35 disabled:hover:border-leather-lit";
  return (
    <div className={clsx("flex items-center justify-between gap-4", disabled && "opacity-50")}>
      <span className="text-base text-bone">{label}</span>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" className={btn} disabled={disabled || index <= 0} onClick={() => onChange(options[index - 1])} aria-label={`Lower ${label.toLowerCase()}`}>
          <Minus className="size-4" />
        </button>
        <output className="min-w-16 text-center font-display text-2xl font-bold text-bone tabular-nums" aria-live="polite">
          {format(value)}
        </output>
        <button
          type="button"
          className={btn}
          disabled={disabled || index >= options.length - 1}
          onClick={() => onChange(options[index + 1])}
          aria-label={`Raise ${label.toLowerCase()}`}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
