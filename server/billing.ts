import { getDb } from './db.js'

export const APP_TIMEZONE = 'Asia/Tashkent'

const pad = (n: number) => String(n).padStart(2, '0')
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_NUM: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/* ── timezone helpers (Uzbekistan) ─────────────────────── */
function tashkentFormat(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function tashkentToday(date: Date = new Date()): string {
  return tashkentFormat(date)
}
export function tashkentMonth(date: Date = new Date()): string {
  return tashkentFormat(date).slice(0, 7)
}
export function tashkentYearMonth(): { year: number; month: number } {
  const key = tashkentFormat().slice(0, 7)
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) }
}

/* ── calendar-driven lesson scheduling ─────────────────── */
export type LessonSchedule = { weekdays: number[] | null; parity: 'odd' | 'even' | null; dayNumbers: number[] | null }

export function parseScheduleDays(raw: string): LessonSchedule {
  const days = (raw || '').trim()
  if (!days) return { weekdays: null, parity: null, dayNumbers: null }
  const dayNumbers = days.split(',').map((part) => Number(part.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
  if (dayNumbers.length) return { weekdays: null, parity: null, dayNumbers }
  if (/odd days/i.test(days)) return { weekdays: null, parity: 'odd', dayNumbers: null }
  if (/even days/i.test(days)) return { weekdays: null, parity: 'even', dayNumbers: null }
  const found = new Set<number>()
  for (const token of days.split(/[,;]| and /)) {
    const segs = token.trim().split('-')
    if (segs.length < 1 || segs.length > 2) continue
    const start = WEEKDAY_NUM[segs[0].trim().slice(0, 3).toLowerCase()]
    if (start === undefined) continue
    if (segs.length === 1) { found.add(start); continue }
    const end = WEEKDAY_NUM[(segs[1] ?? '').trim().slice(0, 3).toLowerCase()]
    if (end === undefined) continue
    for (let d = start; ; d = (d + 1) % 7) { found.add(d); if (d === end) break }
  }
  return { weekdays: found.size ? [...found].sort((a, b) => a - b) : null, parity: null, dayNumbers: null }
}

/** Every actual calendar date in the given month that falls on a lesson day. */
export function getLessonDates(year: number, month: number, scheduleDays: string): string[] {
  const { weekdays, parity, dayNumbers } = parseScheduleDays(scheduleDays)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const dates: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    let match = false
    if (dayNumbers && dayNumbers.length) match = dayNumbers.includes(d)
    else if (parity) match = parity === 'odd' ? d % 2 === 1 : d % 2 === 0
    else if (weekdays && weekdays.length) match = weekdays.includes(new Date(Date.UTC(year, month - 1, d)).getUTCDay())
    if (match) dates.push(`${year}-${pad(month)}-${pad(d)}`)
  }
  return dates
}

export function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEKDAY_LABELS[new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()] ?? ''
}

/* ── monthly billing records ───────────────────────────── */
export type BillStatus = 'paid' | 'partially_paid' | 'debtor'
export type BillRow = {
  id: number
  student_id: number
  student_name: string
  year: number
  month: number
  month_key: string
  group_name: string
  course_name: string
  monthly_price: number
  paid_amount: number
  remaining_amount: number
  status: BillStatus
  created_at: string
  updated_at: string
}

function billStatus(price: number, paid: number): BillStatus {
  if (price <= 0 || paid >= price) return 'paid'
  return paid > 0 ? 'partially_paid' : 'debtor'
}

type PriceContext = { price: number; groupId: number | null; groupName: string; courseName: string }

function priceContext(student: { id: number; name: string; group_name: string | null }): PriceContext {
  const db = getDb()
  if (!student.group_name) return { price: 0, groupId: null, groupName: '', courseName: '' }
  const group = db.prepare('SELECT id, name, course FROM groups WHERE name = ?').get(student.group_name) as { id: number; name: string; course: string } | undefined
  if (!group) return { price: 0, groupId: null, groupName: '', courseName: '' }
  let price = 0
  if (group.course) {
    const course = db.prepare('SELECT monthly_fee FROM courses WHERE name = ?').get(group.course) as { monthly_fee: number } | undefined
    price = Number(course?.monthly_fee ?? 0)
  }
  return { price, groupId: group.id, groupName: group.name, courseName: group.course || '' }
}

/**
 * Returns the billing record id for (student, year, month), creating it with a
 * price snapshot when it does not exist. Idempotent via UNIQUE(student_id, year, month).
 */
export function getOrCreateBill(studentId: number, year: number, month: number): number | null {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM bills WHERE student_id = ? AND year = ? AND month = ?').get(studentId, year, month) as { id: number } | undefined
  if (existing) return existing.id
  const student = db.prepare('SELECT id, name, group_name FROM students WHERE id = ?').get(studentId) as { id: number; name: string; group_name: string | null } | undefined
  if (!student) return null
  const { price, groupId, groupName, courseName } = priceContext(student)
  db.prepare(`INSERT OR IGNORE INTO bills
      (student_id, student_name, year, month, group_id, group_name, course_name, monthly_price, paid_amount, remaining_amount, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(student.id, student.name, year, month, groupId, groupName, courseName, price, price, billStatus(price, 0))
  return (db.prepare('SELECT id FROM bills WHERE student_id = ? AND year = ? AND month = ?').get(studentId, year, month) as { id: number } | undefined)?.id ?? null
}

function linkPaymentsToBills(year: number, month: number) {
  const db = getDb()
  db.prepare(`UPDATE payments SET billing_id = (
      SELECT b.id FROM bills b WHERE b.student_id = payments.student_id AND b.year = ? AND b.month = ?
    ) WHERE billing_id IS NULL AND student_id IS NOT NULL AND substr(paid_at, 1, 7) = ?`)
    .run(year, month, `${year}-${pad(month)}`)
}

/** Recompute paid_amount / remaining_amount / status for a month's bills. */
export function recalcBills(year: number, month: number, studentId?: number) {
  const db = getDb()
  const rows = studentId
    ? db.prepare('SELECT id FROM bills WHERE year = ? AND month = ? AND student_id = ?').all(year, month, studentId)
    : db.prepare('SELECT id FROM bills WHERE year = ? AND month = ?').all(year, month)
  const update = db.prepare('UPDATE bills SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  for (const row of rows as { id: number }[]) {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(row.id) as BillRow
    const paid = Number((db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE billing_id = ?').get(row.id) as { total: number }).total)
    const remaining = Math.max(0, bill.monthly_price - paid)
    update.run(paid, remaining, billStatus(bill.monthly_price, paid), bill.id)
  }
}

/** Automatic monthly job: create billing for every active student, never duplicate. */
export function ensureBillsForYearMonth(year: number, month: number): { count: number } {
  const db = getDb()
  let created = 0
  const run = db.transaction(() => {
    const before = Number((db.prepare('SELECT COUNT(*) as n FROM bills WHERE year = ? AND month = ?').get(year, month) as { n: number }).n)
    const students = db.prepare("SELECT id, name, group_name, status FROM students WHERE status = '' OR status = 'Active'").all() as { id: number; name: string; group_name: string | null; status: string }[]
    for (const student of students) {
      if (!student.group_name) continue
      getOrCreateBill(student.id, year, month)
    }
    const after = Number((db.prepare('SELECT COUNT(*) as n FROM bills WHERE year = ? AND month = ?').get(year, month) as { n: number }).n)
    created = after - before
    linkPaymentsToBills(year, month)
    recalcBills(year, month)
  })
  run()
  return { count: created }
}

export function runMonthlyBilling(_label = 'timer'): { year: number; month: number; count: number } {
  const { year, month } = tashkentYearMonth()
  const { count } = ensureBillsForYearMonth(year, month)
  return { year, month, count }
}

/** After a payment is created / edited / deleted, keep its bill in sync. */
export function refreshBillingForPayment(paymentId: number) {
  const db = getDb()
  const payment = db.prepare('SELECT id, student_id, billing_id, paid_at FROM payments WHERE id = ?').get(paymentId) as { id: number; student_id: number | null; billing_id: number | null; paid_at: string } | undefined
  if (!payment || !payment.student_id) return
  const ym = String(payment.paid_at || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return
  const year = Number(ym.slice(0, 4))
  const month = Number(ym.slice(5, 7))
  const billId = getOrCreateBill(payment.student_id, year, month)
  if (billId && !payment.billing_id) db.prepare('UPDATE payments SET billing_id = ? WHERE id = ?').run(billId, paymentId)
  linkPaymentsToBills(year, month)
  recalcBills(year, month)
}

/** Remove a payment's link and recompute its former month. */
export function detachBillingForPayment(paymentId: number) {
  const db = getDb()
  const payment = db.prepare('SELECT id, student_id, paid_at FROM payments WHERE id = ?').get(paymentId) as { id: number; student_id: number | null; paid_at: string } | undefined
  if (!payment || !payment.student_id) return
  const ym = String(payment.paid_at || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return
  db.prepare('UPDATE payments SET billing_id = NULL WHERE id = ?').run(paymentId)
  recalcBills(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)))
}

export function mapBill(row: Record<string, unknown>): BillRow {
  return {
    id: Number(row.id),
    student_id: Number(row.student_id),
    student_name: String(row.student_name ?? ''),
    year: Number(row.year),
    month: Number(row.month),
    month_key: `${Number(row.year)}-${pad(Number(row.month))}`,
    group_name: String(row.group_name ?? ''),
    course_name: String(row.course_name ?? ''),
    monthly_price: Number(row.monthly_price ?? 0),
    paid_amount: Number(row.paid_amount ?? 0),
    remaining_amount: Number(row.remaining_amount ?? 0),
    status: (row.status ?? 'debtor') as BillStatus,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export type BillingOverview = {
  year: number
  month: number
  month_key: string
  summary: { total_students: number; expected_revenue: number; paid: number; outstanding: number }
  debtors: BillRow[]
  students: BillRow[]
}

export function billingOverview(year: number, month: number): BillingOverview {
  const db = getDb()
  const rows = (db.prepare('SELECT * FROM bills WHERE year = ? AND month = ?').all(year, month) as Record<string, unknown>[])
    .map(mapBill)
    .sort((a, b) => a.student_name.localeCompare(b.student_name))
  const summary = {
    total_students: rows.length,
    expected_revenue: rows.reduce((sum, bill) => sum + bill.monthly_price, 0),
    paid: rows.reduce((sum, bill) => sum + bill.paid_amount, 0),
    outstanding: rows.reduce((sum, bill) => sum + bill.remaining_amount, 0),
  }
  const debtors = rows.filter((bill) => bill.remaining_amount > 0).sort((a, b) => b.remaining_amount - a.remaining_amount)
  return { year, month, month_key: `${year}-${pad(month)}`, summary, debtors, students: rows }
}