import { useState } from "react";

export type FilterOption = { value: string; label: string; hint?: string; disabled?: boolean };

export function uniqueSorted(values: (string | number | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function toOptions(values: (string | number | null | undefined)[]): FilterOption[] {
  return uniqueSorted(values).map((value) => ({ value, label: value }));
}

export function matchesText(cells: (string | number | null | undefined)[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return cells.some((cell) => String(cell ?? "").toLowerCase().includes(needle));
}

export function useFilters<T extends object>(defaults: T) {
  const [values, setValues] = useState<T>(defaults);
  const active = Object.values(values as Record<string, unknown>).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  return {
    values,
    active,
    set: <K extends keyof T>(key: K, value: T[K]) =>
      setValues((current) => ({ ...current, [key]: value })),
    reset: () => setValues(defaults),
  };
}

export function panelCount(label: string, shown: number, total: number, filtered: boolean) {
  return filtered ? `${label} (${shown} of ${total})` : `${label} (${total})`;
}
