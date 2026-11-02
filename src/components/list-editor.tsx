"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "./ui";

export type ListColumn<T> = {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  /** Relative column width (CSS grid fr). */
  width?: number;
  /** Read-only for rows where this returns true. */
  locked?: (row: T) => boolean;
  mono?: boolean;
};

/** Rows of short text fields with reorder, add and remove. Replaces hand-editing JSON. */
export function RowListEditor<T extends object>({
  value,
  columns,
  onChange,
  newRow,
  addLabel = "Add",
  canRemove,
  minRows = 0,
}: {
  value: T[];
  columns: ListColumn<T>[];
  onChange: (v: T[]) => void;
  newRow: () => T;
  addLabel?: string;
  /** Rows the pipeline needs can't be deleted. */
  canRemove?: (row: T) => boolean;
  minRows?: number;
}) {
  const grid = { gridTemplateColumns: `${columns.map((c) => `${c.width ?? 1}fr`).join(" ")} auto` };
  const update = (i: number, key: keyof T, v: string) => onChange(value.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.length ? (
        <div className="hidden gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-stone-400 sm:grid" style={grid}>
          {columns.map((c) => (
            <span key={c.key}>{c.label}</span>
          ))}
          <span className="w-[84px]" />
        </div>
      ) : null}
      {value.map((row, i) => (
        <div key={i} className="grid items-start gap-2 rounded-lg bg-stone-50 p-2 ring-1 ring-stone-200 max-sm:!grid-cols-1" style={grid}>
          {columns.map((c) => (
            <Input
              key={c.key}
              className={`h-9 text-[13px] ${c.mono ? "font-mono" : ""}`}
              value={String(row[c.key] ?? "")}
              placeholder={c.placeholder}
              readOnly={c.locked?.(row)}
              title={c.locked?.(row) ? "Used by the app; can't be renamed" : undefined}
              onChange={(e) => update(i, c.key, e.target.value)}
              aria-label={c.label}
            />
          ))}
          <div className="flex">
            <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" icon={<ArrowUp className="size-3.5" />} />
            <Button size="sm" variant="ghost" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down" icon={<ArrowDown className="size-3.5" />} />
            <Button
              size="sm"
              variant="ghost"
              className="text-stone-400 hover:text-red-600"
              disabled={value.length <= minRows || (canRemove ? !canRemove(row) : false)}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label="Remove"
              icon={<Trash2 className="size-3.5" />}
            />
          </div>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => onChange([...value, newRow()])}>
        {addLabel}
      </Button>
    </div>
  );
}
