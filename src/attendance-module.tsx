import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Eye,
  RotateCcw,
  Search,
  UserX,
  X,
} from "lucide-react";
import "./attendance-module.css";

/* ── shared types ─────────────────────────────────────── */
export type AttStatus = "was" | "not" | "late" | "excused";
export type AttRecord = { id: number; group_id: number; student_id: number; attendance_date: string; status: AttStatus; marked_by?: string; created_at?: string };
export type AttendanceGroup = { id: number; name: string; course?: string | null; teacher?: string | null; room_name?: string | null; schedule?: string | null; schedule_days?: string | null; schedule_time?: string | null; students_count?: number; status?: string };
export type AttendanceStudent = { id: number; name: string; group_name?: string | null; teacher_name?: string | null; level?: string | null; status?: string };
export type AttendanceModuleProps = { groups: AttendanceGroup[]; students: AttendanceStudent[]; markUserName: string; canWrite: boolean };

/* ── configuration ────────────────────────────────────── */
const ALLOW_FUTURE_DATES = false;

const STATUS_META: Record<AttStatus, { label: string; clazz: string }> = {
  was: { label: "Was", clazz: "am-badge-was" },
  not: { label: "Not", clazz: "am-badge-not" },
  late: { label: "Late", clazz: "am-badge-late" },
  excused: { label: "Excused", clazz: "am-badge-excused" },
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ByDate = Record<string, Record<number, AttRecord>>;

/* ── date helpers ─────────────────────────────────────── */
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => ymd(new Date());
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const timeOf = (s: string) => (s || "").slice(11, 16);
const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

/* ── lesson schedule ──────────────────────────────────── */
type Schedule = { weekdays: number[] | null; parity: "odd" | "even" | null; dayNumbers: number[] | null };
const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function parseSchedule(group: AttendanceGroup): Schedule {
  const raw = (group.schedule_days || (group.schedule ?? "")).split("·")[0].trim();
  if (!raw) return { weekdays: null, parity: null, dayNumbers: null };
  const dayNumbers = raw.split(",").map((part) => Number(part.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  if (dayNumbers.length) return { weekdays: null, parity: null, dayNumbers };
  if (/odd days/i.test(raw)) return { weekdays: null, parity: "odd", dayNumbers: null };
  if (/even days/i.test(raw)) return { weekdays: null, parity: "even", dayNumbers: null };
  const found = new Set<number>();
  for (const token of raw.split(/[,;]| and /)) {
    const segs = token.trim().split("-");
    if (segs.length !== 1 && segs.length !== 2) continue;
    const start = WEEKDAY_INDEX[segs[0].trim().slice(0, 3).toLowerCase()];
    if (start === undefined) continue;
    if (segs.length === 1) { found.add(start); continue; }
    const end = WEEKDAY_INDEX[segs[1].trim().slice(0, 3).toLowerCase()];
    if (end === undefined) continue;
    for (let d = start; ; d = (d + 1) % 7) { found.add(d); if (d === end) break; }
  }
  return { weekdays: found.size ? [...found].sort((a, b) => a - b) : null, parity: null, dayNumbers: null };
}

function isLessonDay(dateStr: string, schedule: Schedule): boolean {
  if (schedule.dayNumbers) return schedule.dayNumbers.includes(Number(dateStr.slice(8, 10)));
  if (schedule.parity) {
    const day = Number(dateStr.slice(8, 10));
    return schedule.parity === "odd" ? day % 2 === 1 : day % 2 === 0;
  }
  if (schedule.weekdays && schedule.weekdays.length) return schedule.weekdays.includes(new Date(`${dateStr}T00:00:00`).getDay());
  return false;
}

function buildDates(group: AttendanceGroup, month: string, allDays: boolean, recorded: string[], canFuture: boolean): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const schedule = parseSchedule(group);
  const now = today();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    const ds = `${month}-${pad2(d)}`;
    if (!canFuture && ds > now) continue;
    if (allDays || isLessonDay(ds, schedule) || recorded.includes(ds)) out.push(ds);
  }
  return out;
}

/* ── state helpers ────────────────────────────────────── */
function applyRecord(prev: ByDate, date: string, studentId: number, record: AttRecord | null): ByDate {
  const next: ByDate = { ...prev };
  const day = { ...(next[date] ?? {}) };
  if (record) day[studentId] = record;
  else delete day[studentId];
  if (Object.keys(day).length) next[date] = day;
  else delete next[date];
  return next;
}

function computeRate(student: AttendanceStudent, dates: string[], map: ByDate): number | null {
  const sessions = dates.filter((d) => map[d]?.[student.id]).length;
  if (!sessions) return null;
  const was = dates.filter((d) => map[d]?.[student.id]?.status === "was").length;
  return Math.round((was / sessions) * 100);
}

/* ═════════════════ main module ═════════════════════════ */
export function AttendanceModule({ groups, students, markUserName, canWrite }: AttendanceModuleProps) {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [groupId, setGroupId] = useState<number>(() => groups[0]?.id ?? 0);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [byDate, setByDate] = useState<ByDate>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "none" | AttStatus>("all");
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [allDays, setAllDays] = useState(false);
  const [fullView, setFullView] = useState(false);
  const [viewMenu, setViewMenu] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [activeCell, setActiveCell] = useState<{ studentId: number; date: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; studentId: number; date: string; studentName: string; status?: AttStatus; markedBy?: string; createdAt?: string } | null>(null);
  const [saving, setSaving] = useState("");
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: "ok" | "error" }[]>([]);

  const viewMonth = monthKey(anchor);
  const todayKey = today();

  const effectiveGroups = useMemo(() => (teacherFilter ? groups.filter((g) => (g.teacher || "") === teacherFilter) : groups), [groups, teacherFilter]);
  const group = effectiveGroups.find((g) => g.id === groupId) ?? null;

  useEffect(() => {
    if (effectiveGroups.length && !effectiveGroups.some((g) => g.id === groupId)) setGroupId(effectiveGroups[0]?.id ?? 0);
  }, [effectiveGroups, groupId]);

  const groupStudents = useMemo(() => {
    if (!group) return [];
    return students.filter((s) => {
      const gn = (s.group_name || "").trim();
      return group.name === gn || group.name.startsWith(gn) || gn.startsWith(group.name.split(" /")[0]);
    });
  }, [students, group]);

  useEffect(() => {
    if (!groupId) { setByDate({}); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/attendance?group_id=${groupId}&month=${viewMonth}`)
      .then((r) => { if (!r.ok) throw new Error("request failed"); return r.json(); })
      .then((rows: AttRecord[]) => {
        if (!alive) return;
        const map: ByDate = {};
        for (const row of rows) (map[row.attendance_date] ??= {})[row.student_id] = row;
        setByDate(map);
        setLoading(false);
      })
      .catch(() => { if (alive) { setByDate({}); setError("Could not load attendance for this group. Check your connection and try again."); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, viewMonth, reloadKey]);

  const recordedDates = useMemo(() => Object.keys(byDate), [byDate]);
  const lessonDates = useMemo(() => (group ? buildDates(group, viewMonth, allDays, recordedDates, ALLOW_FUTURE_DATES) : []), [group, viewMonth, allDays, recordedDates]);
  const lessonOnly = useMemo(() => (group ? buildDates(group, viewMonth, false, recordedDates, ALLOW_FUTURE_DATES) : []), [group, viewMonth, recordedDates]);
  const statsDate = lessonDates.filter((d) => d <= todayKey).at(-1);

  const stats = useMemo(() => {
    const counts = { was: 0, not: 0, late: 0, excused: 0, unmarked: 0 };
    if (groupStudents.length) {
      for (const s of groupStudents) {
        const rec = statsDate ? byDate[statsDate]?.[s.id] : undefined;
        if (rec) counts[rec.status]++;
        else counts.unmarked++;
      }
    }
    const marked = counts.was + counts.not + counts.late + counts.excused;
    const rate = marked ? Math.round((counts.was / marked) * 100) : 0;
    return { ...counts, total: groupStudents.length, marked, rate };
  }, [byDate, statsDate, groupStudents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupStudents.filter((s) => {
      if (q && !(s.name.toLowerCase().includes(q) || (s.teacher_name || "").toLowerCase().includes(q) || (s.level || "").toLowerCase().includes(q))) return false;
      if (statsDate) {
        const rec = byDate[statsDate]?.[s.id];
        if (statusFilter !== "all") {
          if (statusFilter === "none" && rec) return false;
          if (statusFilter !== "none" && (!rec || rec.status !== statusFilter)) return false;
        }
        if (onlyAbsent && !(rec && rec.status === "not")) return false;
        if (onlyUnmarked && rec) return false;
      }
      return true;
    });
  }, [groupStudents, search, statusFilter, onlyAbsent, onlyUnmarked, byDate, statsDate]);

  useEffect(() => { setPage(0); }, [search, statusFilter, onlyAbsent, onlyUnmarked, groupId]);
  useEffect(() => { setViewMenu(false); }, [groupId]);

  useEffect(() => {
    if (!activeCell) return;
    const close = () => setActiveCell(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [activeCell]);

  useEffect(() => {
    if (!viewMenu) return;
    const close = () => setViewMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [viewMenu]);

  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const toast = (message: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, kind }]);
    window.setTimeout(() => setToasts((items) => items.filter((t) => t.id !== id)), 2600);
  };

  const nameOf = (id: number) => groupStudents.find((s) => s.id === id)?.name ?? "Student";

  const setStatus = async (studentId: number, date: string, status: AttStatus | null) => {
    if (!group || saving) return;
    const existing = byDate[date]?.[studentId];
    const key = `${studentId}:${date}`;
    const rollback = byDate;
    setSaving(key);
    setActiveCell(null);
    const optimistic: AttRecord | null = status
      ? { id: existing?.id ?? -1, group_id: group.id, student_id: studentId, attendance_date: date, status, marked_by: existing?.marked_by || markUserName }
      : null;
    setByDate((prev) => applyRecord(prev, date, studentId, optimistic));
    try {
      if (status) {
        const response = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group_id: group.id, student_id: studentId, attendance_date: date, status }),
        });
        if (!response.ok) throw new Error("save failed");
        const saved = (await response.json()) as AttRecord;
        setByDate((prev) => applyRecord(prev, date, studentId, saved));
        toast(status === "not" ? `${nameOf(studentId)} marked absent` : `${nameOf(studentId)} → ${STATUS_META[status].label}`);
      } else if (existing && existing.id > 0) {
        const response = await fetch(`/api/attendance/${existing.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("delete failed");
        toast("Attendance entry cleared");
      }
    } catch {
      setByDate(rollback);
      toast("Could not save attendance", "error");
    } finally {
      setSaving("");
    }
  };

  const monthLabel = anchor.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const teacherOptions = useMemo(() => [...new Set(groups.map((g) => (g.teacher || "").trim()).filter((t) => t))].sort(), [groups]);
  const hasFilters = !!(search || teacherFilter || statusFilter !== "all" || onlyAbsent || onlyUnmarked);

  const openCell = (pos: { clientX: number; clientY: number }, studentId: number, date: string) => {
    if (!canWrite) return;
    if (activeCell && activeCell.studentId === studentId && activeCell.date === date) { setActiveCell(null); return; }
    setHover(null);
    setActiveCell({ studentId, date, x: pos.clientX, y: pos.clientY });
  };

  const popoverLeft = activeCell ? Math.max(8, Math.min(activeCell.x, window.innerWidth - 190)) : 0;
  const popoverTop = activeCell ? Math.max(8, Math.min(activeCell.y, window.innerHeight - 260)) : 0;
  const activeStudent = activeCell ? groupStudents.find((s) => s.id === activeCell.studentId) : null;

  const content = () => {
    if (!group) return <AttendanceEmptyState message="No groups match the current filters. Create a group, then mark attendance here." />;
    if (loading) return <AttendanceLoadingState />;
    if (error) return <div className="am-empty"><AlertTriangle size={36} /><p>{error}</p><button className="secondary-button" onClick={() => setReloadKey((k) => k + 1)}>Try again</button></div>;
    if (!groupStudents.length) return <AttendanceEmptyState message={`No students are assigned to "${group.name}" yet. Add students to start marking attendance.`} />;
    return (
      <>
        <AttendanceStats stats={stats} statsDate={statsDate} groupName={group.name} />
        <AttendanceTable
          group={group}
          dates={lessonDates}
          lessonOnly={lessonOnly}
          rows={pageRows}
          total={filtered.length}
          byDate={byDate}
          todayKey={todayKey}
          fullView={fullView}
          saving={saving}
          onCellClick={openCell}
          onCellHover={(pos, studentId, date) => setHover({ x: pos.clientX, y: pos.clientY, studentId, date, studentName: nameOf(studentId), status: byDate[date]?.[studentId]?.status, markedBy: byDate[date]?.[studentId]?.marked_by, createdAt: byDate[date]?.[studentId]?.created_at })}
          onCellLeave={() => setHover(null)}
        />
        <AttendancePager page={page} pageSize={pageSize} total={filtered.length} totalPages={totalPages} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
        {!!lessonDates.length && <AttendanceLegend />}
      </>
    );
  };

  return (
    <>
      <div className="am-shell">
        <AttendanceToolbar
          teacherOptions={teacherOptions}
          teacherFilter={teacherFilter}
          onTeacher={setTeacherFilter}
          groups={effectiveGroups}
          groupId={groupId}
          onGroup={(id) => setGroupId(id)}
          search={search}
          onSearch={setSearch}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          onlyAbsent={onlyAbsent}
          onlyUnmarked={onlyUnmarked}
          onToggleAbsent={() => setOnlyAbsent((v) => !v)}
          onToggleUnmarked={() => setOnlyUnmarked((v) => !v)}
          hasFilters={hasFilters}
          onClear={() => { setSearch(""); setTeacherFilter(""); setStatusFilter("all"); setOnlyAbsent(false); setOnlyUnmarked(false); }}
        />
        <AttendanceDateNavigator
          label={monthLabel}
          onToday={() => setAnchor(new Date())}
          onPrevMonth={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
          onPrevWeek={() => setAnchor(new Date(anchor.getTime() - 7 * 86400000))}
          onNextWeek={() => setAnchor(new Date(anchor.getTime() + 7 * 86400000))}
          onNextMonth={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
          viewOpen={viewMenu}
          onToggleView={() => setViewMenu((v) => !v)}
          allDays={allDays}
          fullView={fullView}
          onToggleAllDays={() => { setAllDays((v) => !v); setViewMenu(false); }}
          onToggleFullView={() => { setFullView((v) => !v); setViewMenu(false); }}
        />
        {!canWrite && <p className="am-note">View only — permission to mark attendance is not granted to this account.</p>}
        {content()}
      </div>

      {activeCell && activeStudent && (
        <AttendanceStatusPopover left={popoverLeft} top={popoverTop} studentName={activeStudent.name} date={activeCell.date} onSelect={(status) => void setStatus(activeCell.studentId, activeCell.date, status)} />
      )}
      {hover && (
        <div className="am-tooltip" style={{ left: Math.min(hover.x + 14, window.innerWidth - 240), top: Math.min(hover.y + 16, window.innerHeight - 120) }}>
          <strong>{hover.studentName}</strong>
          <span>{hover.date} {hover.status ? `· ${STATUS_META[hover.status].label}` : "· Not marked"}</span>
          {hover.markedBy && <span>Marked by {hover.markedBy}{hover.createdAt ? ` at ${timeOf(hover.createdAt)}` : ""}</span>}
        </div>
      )}
      <div className="am-toast-host">
        {toasts.map((t) => (
          <div key={t.id} className={`am-toast ${t.kind}`}>{t.kind === "ok" ? <Check size={16} /> : <X size={16} />}<span>{t.message}</span></div>
        ))}
      </div>
    </>
  );
}

/* ═════════════════ toolbar / navigator ═════════════════ */
function AttendanceToolbar({ teacherOptions, teacherFilter, onTeacher, groups, groupId, onGroup, search, onSearch, statusFilter, onStatusFilter, onlyAbsent, onlyUnmarked, onToggleAbsent, onToggleUnmarked, hasFilters, onClear }: {
  teacherOptions: string[];
  teacherFilter: string;
  onTeacher: (value: string) => void;
  groups: AttendanceGroup[];
  groupId: number;
  onGroup: (id: number) => void;
  search: string;
  onSearch: (value: string) => void;
  statusFilter: "all" | "none" | AttStatus;
  onStatusFilter: (value: "all" | "none" | AttStatus) => void;
  onlyAbsent: boolean;
  onlyUnmarked: boolean;
  onToggleAbsent: () => void;
  onToggleUnmarked: () => void;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="am-toolbar">
      <select className="am-select" aria-label="Filter by teacher" value={teacherFilter} onChange={(e) => onTeacher(e.target.value)}>
        <option value="">All teachers</option>
        {teacherOptions.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className="am-select" aria-label="Select group" value={groupId} onChange={(e) => onGroup(Number(e.target.value))}>
        {groups.length ? groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>) : <option value={0}>No groups</option>}
      </select>
      <div className="am-search"><Search size={14} /><input placeholder="Search students…" value={search} onChange={(e) => onSearch(e.target.value)} /></div>
      <select className="am-select" aria-label="Filter by status" value={statusFilter} onChange={(e) => onStatusFilter(e.target.value as "all" | "none" | AttStatus)}>
        <option value="all">All statuses</option>
        <option value="was">Present</option>
        <option value="not">Absent</option>
        <option value="late">Late</option>
        <option value="excused">Excused</option>
        <option value="none">Not marked</option>
      </select>
      <button className={`am-tag ${onlyAbsent ? "on" : ""}`} onClick={onToggleAbsent}>Absent only</button>
      <button className={`am-tag ${onlyUnmarked ? "on" : ""}`} onClick={onToggleUnmarked}>Not marked</button>
      {hasFilters && <button className="am-tag" onClick={onClear}><RotateCcw size={12} /> Reset</button>}
    </div>
  );
}

function AttendanceDateNavigator({ label, onToday, onPrevMonth, onPrevWeek, onNextWeek, onNextMonth, viewOpen, onToggleView, allDays, fullView, onToggleAllDays, onToggleFullView }: {
  label: string;
  onToday: () => void;
  onPrevMonth: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onNextMonth: () => void;
  viewOpen: boolean;
  onToggleView: () => void;
  allDays: boolean;
  fullView: boolean;
  onToggleAllDays: () => void;
  onToggleFullView: () => void;
}) {
  return (
    <div className="am-nav">
      <button className="am-nav-current" onClick={onToday}>Current</button>
      <button className="am-nav-btn" onClick={onPrevMonth} title="Previous month"><ChevronsLeft size={16} /></button>
      <button className="am-nav-btn" onClick={onPrevWeek} title="Previous week"><ChevronLeft size={16} /></button>
      <span className="am-nav-label">{label}</span>
      <button className="am-nav-btn" onClick={onNextWeek} title="Next week"><ChevronRight size={16} /></button>
      <button className="am-nav-btn" onClick={onNextMonth} title="Next month"><ChevronsRight size={16} /></button>
      <div className="am-nav-view">
        <button className={`am-nav-btn ${viewOpen ? "active" : ""}`} onClick={onToggleView} title="View options"><Eye size={16} /></button>
        {viewOpen && (
          <div className="am-view-menu" onMouseDown={(e) => e.stopPropagation()}>
            <div className="am-view-head">View options</div>
            <button onClick={onToggleAllDays}><span className={`am-view-check ${allDays ? "on" : ""}`}>{allDays && <Check size={12} />}</span> Show all dates</button>
            <button onClick={onToggleFullView}><span className={`am-view-check ${fullView ? "on" : ""}`}>{fullView && <Check size={12} />}</span> Show attendance %</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════ stats ═══════════════════════════════ */
function AttendanceStats({ stats, statsDate, groupName }: { stats: { was: number; not: number; late: number; excused: number; unmarked: number; total: number; marked: number; rate: number }; statsDate: string | undefined; groupName: string }) {
  return (
    <div className="am-stats">
      <div className="am-stat"><div className="am-stat-label">Students · {groupName}</div><div className="am-stat-val">{stats.total}</div></div>
      <div className="am-stat"><div className="am-stat-label">Present</div><div className="am-stat-val green">{stats.was}</div></div>
      <div className="am-stat"><div className="am-stat-label">Absent</div><div className="am-stat-val red">{stats.not}</div></div>
      <div className="am-stat"><div className="am-stat-label">Late</div><div className="am-stat-val yellow">{stats.late}</div></div>
      <div className="am-stat"><div className="am-stat-label">Excused</div><div className="am-stat-val blue">{stats.excused}</div></div>
      <div className="am-stat"><div className="am-stat-label">Not marked</div><div className="am-stat-val">{stats.unmarked}</div></div>
      <div className="am-stat"><div className="am-stat-label">Attendance rate{statsDate ? ` · ${statsDate}` : ""}</div><div className="am-stat-val blue">{stats.rate}%</div></div>
    </div>
  );
}

/* ═════════════════ table ═══════════════════════════════ */
function AttendanceTable({ group, dates, lessonOnly, rows, total, byDate, todayKey, fullView, saving, onCellClick, onCellHover, onCellLeave }: {
  group: AttendanceGroup;
  dates: string[];
  lessonOnly: string[];
  rows: AttendanceStudent[];
  total: number;
  byDate: ByDate;
  todayKey: string;
  fullView: boolean;
  saving: string;
  onCellClick: (pos: { clientX: number; clientY: number }, studentId: number, date: string) => void;
  onCellHover: (pos: { clientX: number; clientY: number }, studentId: number, date: string) => void;
  onCellLeave: () => void;
}) {
  if (!dates.length) {
    return (
      <div className="am-scroll"><div className="am-empty" style={{ padding: "44px 20px" }}><CalendarDays size={36} /><p>No lesson dates for this group in the selected period.</p></div></div>
    );
  }
  const colSpan = 1 + dates.length + (fullView ? 1 : 0);
  return (
    <div className="am-scroll">
      <table className="am-grid">
        <thead>
          <tr>
            <th className="am-corner">
              <div className="am-corner-label">Students</div>
              <div className="am-corner-hint">{total} · {group.name}</div>
            </th>
            {dates.map((d) => <AttendanceHeader key={d} date={d} todayKey={todayKey} lesson={lessonOnly.includes(d)} />)}
            {fullView && <th className="am-pct-th">Rate</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((s) => (
            <AttendanceStudentRow
              key={s.id}
              student={s}
              dates={dates}
              byDate={byDate}
              todayKey={todayKey}
              fullView={fullView}
              saving={saving}
              onCellClick={onCellClick}
              onCellHover={onCellHover}
              onCellLeave={onCellLeave}
            />
          )) : (
            <tr><td colSpan={colSpan}><div className="am-empty" style={{ padding: "40px 20px" }}><p>No students match the current filters.</p></div></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceHeader({ date, todayKey, lesson }: { date: string; todayKey: string; lesson: boolean }) {
  const dt = new Date(`${date}T00:00:00`);
  const isToday = date === todayKey;
  return (
    <th className={`am-dh ${isToday ? "today" : ""} ${lesson ? "" : "weekend"}`}>
      <div className="day">{DOW[dt.getDay()]}</div>
      <div className="dnum">{dt.getDate()}</div>
      <div className="wd">{dt.toLocaleDateString("en-US", { month: "short" })}</div>
    </th>
  );
}

function AttendanceStudentRow({ student, dates, byDate, todayKey, fullView, saving, onCellClick, onCellHover, onCellLeave }: {
  student: AttendanceStudent;
  dates: string[];
  byDate: ByDate;
  todayKey: string;
  fullView: boolean;
  saving: string;
  onCellClick: (pos: { clientX: number; clientY: number }, studentId: number, date: string) => void;
  onCellHover: (pos: { clientX: number; clientY: number }, studentId: number, date: string) => void;
  onCellLeave: () => void;
}) {
  const rate = fullView ? computeRate(student, dates, byDate) : null;
  const pctClass = rate === null ? "" : rate >= 70 ? "high" : rate >= 50 ? "mid" : "low";
  return (
    <tr>
      <td className="am-nc">
        <div className="avatar">{initials(student.name)}</div>
        <span className="nm" title={student.name}>{student.name}</span>
      </td>
      {dates.map((d) => (
        <AttendanceCell
          key={d}
          date={d}
          lesson={true}
          future={d > todayKey}
          busy={saving === `${student.id}:${d}`}
          record={byDate[d]?.[student.id]}
          onClick={(pos) => onCellClick(pos, student.id, d)}
          onHover={(pos) => onCellHover(pos, student.id, d)}
          onLeave={onCellLeave}
        />
      ))}
      {fullView && <td className={`am-pct-col ${pctClass}`}>{rate === null ? "—" : `${rate}%`}</td>}
    </tr>
  );
}

function AttendanceCell({ date, lesson, future, busy, record, onClick, onHover, onLeave }: {
  date: string;
  lesson: boolean;
  future: boolean;
  busy: boolean;
  record?: AttRecord;
  onClick: (pos: { clientX: number; clientY: number }) => void;
  onHover: (pos: { clientX: number; clientY: number }) => void;
  onLeave: () => void;
}) {
  const status = record?.status;
  const markable = lesson && !future && !busy;
  return (
    <td
      className={`am-cell ${lesson ? "" : "weekend"} ${future ? "future" : ""} ${busy ? "am-cell-saving" : ""}`}
      onMouseEnter={(e) => onHover(e)}
      onMouseLeave={onLeave}
      onClick={(e) => { if (markable) onClick(e); }}
      aria-label={status ? STATUS_META[status].label : `Not marked ${date}`}
    >
      {status ? <AttendanceStatusBadge status={status} /> : <span className="am-empty-dot" />}
    </td>
  );
}

function AttendanceStatusBadge({ status }: { status: AttStatus }) {
  const meta = STATUS_META[status];
  return <span className={`am-badge ${meta.clazz}`}>{meta.label}</span>;
}

function AttendanceStatusPopover({ left, top, studentName, date, onSelect }: {
  left: number;
  top: number;
  studentName: string;
  date: string;
  onSelect: (status: AttStatus | null) => void;
}) {
  return (
    <div className="am-popover" style={{ left: `${left}px`, top: `${top}px` }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="am-popover-head">
        <strong>{studentName}</strong>
        <span>{date}</span>
      </div>
      <button className="am-popover-item" onClick={() => onSelect("was")}><Check size={14} style={{ color: "#1d7a4b" }} /> Present</button>
      <button className="am-popover-item" onClick={() => onSelect("not")}><X size={14} style={{ color: "#b27a1d" }} /> Absent</button>
      <button className="am-popover-item" onClick={() => onSelect("late")}><Clock size={14} style={{ color: "#d97706" }} /> Late</button>
      <button className="am-popover-item" onClick={() => onSelect("excused")}><UserX size={14} style={{ color: "#7c3aed" }} /> Excused</button>
      <button className="am-popover-item danger" onClick={() => onSelect(null)}><RotateCcw size={14} /> Clear</button>
    </div>
  );
}

/* ═════════════════ legend / pager / states ═════════════ */
function AttendanceLegend() {
  return (
    <div className="am-legend">
      <span className="am-legend-item"><span className="am-legend-dot am-badge-was" /> Present</span>
      <span className="am-legend-item"><span className="am-legend-dot am-badge-not" /> Absent</span>
      <span className="am-legend-item"><span className="am-legend-dot am-badge-late" /> Late</span>
      <span className="am-legend-item"><span className="am-legend-dot am-badge-excused" /> Excused</span>
      <span className="am-legend-item"><span className="am-legend-dot am-empty-dot plain" /> Not marked</span>
    </div>
  );
}

function AttendancePager({ page, pageSize, total, totalPages, onPage, onPageSize }: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="am-pager">
      <span>Showing {total ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, total)} of {total} students</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select className="am-select" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <button disabled={page === 0} onClick={() => onPage(page - 1)}>Prev</button>
        <span>{page + 1} / {totalPages}</span>
        <button disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function AttendanceLoadingState() {
  const cols = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="am-scroll">
      <table className="am-grid">
        <thead>
          <tr>
            <th className="am-corner"><div className="am-skel" style={{ width: 90, height: 12 }} /></th>
            {cols.map((i) => <th key={i} className="am-dh"><div className="am-skel" style={{ width: 26, height: 12, margin: "0 auto" }} /></th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, r) => (
            <tr key={r}>
              <td className="am-nc"><div className="am-skel" style={{ width: 120, height: 12 }} /></td>
              {cols.map((i) => <td key={i} className="am-cell"><div className="am-skel" style={{ width: 34, height: 16, margin: "0 auto" }} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceEmptyState({ message }: { message: string }) {
  return (
    <div className="am-empty"><CalendarDays size={40} /><p>{message}</p></div>
  );
}