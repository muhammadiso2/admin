import { useState } from "react";
import type { ReactNode } from "react";
import { ATTENDANCE_DAYS_LIMIT, parseAttendanceDays } from "./attendance-days";
import "./attendance-days-picker.css";

export function AttendanceDaysPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hint, setHint] = useState("");
  const LIMIT = ATTENDANCE_DAYS_LIMIT;
  const selected = parseAttendanceDays(value);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const odd = selected.filter((n) => n % 2 === 1).length;
  const even = selected.length - odd;

  const toggle = (day: number) => {
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      if (next.size >= LIMIT) {
        setHint(`You can choose up to ${LIMIT} days per month.`);
        window.setTimeout(() => setHint(""), 2200);
        return;
      }
      next.add(day);
    }
    onChange([...next].sort((a, b) => a - b).join(","));
  };

  const renderCells = (oddParity: boolean) => {
    const cells: ReactNode[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      if ((day % 2 === 1) !== oddParity) continue;
      const selectedOn = selected.includes(day);
      cells.push(
        <button
          key={day}
          type="button"
          className={`adp-cell ${oddParity ? "odd" : "even"} ${selectedOn ? "sel" : ""}`}
          disabled={!selectedOn && selected.length >= LIMIT}
          onClick={() => toggle(day)}
        >
          {day}
        </button>
      );
    }
    return cells;
  };

  return (
    <div className="adp">
      <div className="adp-panels">
        <div className="adp-panel odd">
          <div className="adp-panel-head">
            <span className="adp-panel-title odd">Odd days</span>
            <span className="adp-count">{odd} selected</span>
          </div>
          <div className="adp-cells">{renderCells(true)}</div>
        </div>
        <div className="adp-panel even">
          <div className="adp-panel-head">
            <span className="adp-panel-title even">Even days</span>
            <span className="adp-count">{even} selected</span>
          </div>
          <div className="adp-cells">{renderCells(false)}</div>
        </div>
      </div>
      <div className="adp-actions">
        <span className={`adp-hint ${selected.length === LIMIT ? "ok" : ""}`}>
          {selected.length === LIMIT
            ? `${LIMIT} attendance days chosen · odd ${odd} · even ${even}`
            : `Choose ${LIMIT} attendance days · odd ${odd} · even ${even}${hint ? ` · ${hint}` : ""}`}
        </span>
        {!!selected.length && (
          <button type="button" className="adp-clear" onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}