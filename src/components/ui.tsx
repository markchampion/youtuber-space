"use client";

import React from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

/** Local state that resets whenever the upstream value changes (no effect needed). */
export function useSyncedState<T>(value: T) {
  const [state, setState] = React.useState(value);
  const [prev, setPrev] = React.useState(value);
  if (prev !== value) {
    setPrev(value);
    setState(value);
  }
  return [state, setState] as const;
}

/** True while the element is on screen or within `margin` of it. */
export function useInView<T extends Element>(margin = "300px") {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, inView] as const;
}

export function cn(...args: Parameters<typeof clsx>) {
  return twMerge(clsx(...args));
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: React.ReactNode;
};

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-stone-900 text-white hover:bg-stone-800",
        variant === "secondary" && "bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50",
        variant === "ghost" && "text-stone-700 hover:bg-stone-200/60",
        variant === "danger" && "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("rounded-xl bg-white ring-1 ring-stone-200", className)} />;
}

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "green" | "amber" | "red" | "blue" | "brand" }) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-stone-100 text-stone-700",
        tone === "green" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        tone === "amber" && "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
        tone === "red" && "bg-red-50 text-red-700 ring-1 ring-red-200",
        tone === "blue" && "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
        tone === "brand" && "bg-orange-50 text-brand-ink ring-1 ring-orange-200",
        className,
      )}
    />
  );
}

export const inputCls =
  "w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-300 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} {...rest} className={cn(inputCls, "h-10", className)} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} {...rest} className={cn(inputCls, "leading-relaxed", className)} />;
  },
);

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cn(inputCls, "h-10 pr-8", className)} />;
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[13px] font-medium text-stone-700">{children}</span>
      {hint ? <span className="text-xs text-stone-500">{hint}</span> : null}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-stone-200", className)}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-stone-500", className)} />;
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-stone-400">{icon}</div> : null}
      <div className="font-medium text-stone-800">{title}</div>
      {children ? <div className="mt-1.5 max-w-md text-sm text-stone-600">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{msg}</div>;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-stone-200/70 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "h-8 rounded-md px-3 text-sm font-medium transition-colors",
            value === it.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

export function fmtTime(t: number | null | undefined) {
  if (t == null) return "–:–";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtUsd(n: number) {
  return n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
}
