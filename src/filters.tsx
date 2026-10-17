import type { ReactNode } from "react";
import { RotateCcw, Search } from "lucide-react";
import type { FilterOption } from "./filter-helpers";

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="fx-bar">{children}</div>;
}

export function FilterSearch({
  value,
  onChange,
  placeholder = "Search records…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="fx-field fx-search-field">
      <span className="fx-label">Search</span>
      <div className="fx-search">
        <Search size={14} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
    </label>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  allLabel?: string | null;
}) {
  if (!options.length) return null;
  return (
    <label className="fx-field">
      <span className="fx-label">{label}</span>
      <select
        className="fx-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (!options.length) return null;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return (
    <div className="fx-field fx-chip-field">
      <span className="fx-label">{label}</span>
      <div className="fx-chip-row">
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`fx-chip ${on ? "on" : ""} ${option.disabled && !on ? "empty" : ""}`}
              aria-pressed={on}
              disabled={option.disabled && !on}
              title={option.disabled && !on ? "No students on this schedule yet" : undefined}
              onClick={() => toggle(option.value)}
            >
              {option.label}
              {option.hint !== undefined && <b className="fx-chip-count">{option.hint}</b>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterReset({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="fx-reset" onClick={onClick}>
      <RotateCcw size={12} /> Reset filters
    </button>
  );
}

export function FilterSpacer() {
  return <div className="fx-spacer" />;
}

export function FilterEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="fx-empty">{children}</div>
      </td>
    </tr>
  );
}
