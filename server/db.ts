import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const bcrypt = require('bcryptjs') as typeof import('bcryptjs')

const root = path.dirname(fileURLToPath(import.meta.url))
export const dbPath = path.join(root, 'centre.sqlite')
export const backupsPath = path.join(root, 'backups')
let db = new Database(dbPath)
db.pragma('foreign_keys = ON')

export const modules = [
  'dashboard', 'students', 'groups', 'teachers', 'courses', 'schedule',
  'attendance', 'payments', 'receipts', 'reports', 'notifications', 'staff',
  'activity', 'debts', 'invoices', 'exams', 'rooms', 'messages', 'system',
]
export const actions = ['view', 'create', 'edit', 'delete']

export function getDb() {
  return db
}

function tableColumns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name)
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT DEFAULT '', is_system INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT NOT NULL, action TEXT NOT NULL, UNIQUE(module, action));
    CREATE TABLE IF NOT EXISTS role_permissions (role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE, permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY(role_id, permission_id));
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER REFERENCES roles(id), avatar TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, parent_name TEXT DEFAULT '', parent_phone TEXT DEFAULT '', group_name TEXT, teacher_name TEXT DEFAULT '', level TEXT DEFAULT '', status TEXT DEFAULT 'Active', balance REAL DEFAULT 0, attendance REAL DEFAULT 0, joined_at TEXT DEFAULT CURRENT_DATE, group_assigned_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, subject TEXT, groups_count INTEGER DEFAULT 0, status TEXT DEFAULT 'Active');
    CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, level TEXT, monthly_fee REAL DEFAULT 0, students_count INTEGER DEFAULT 0, color TEXT DEFAULT '#377d72');
    CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, course TEXT, teacher TEXT, room_name TEXT DEFAULT '', schedule TEXT, schedule_days TEXT DEFAULT '', schedule_time TEXT DEFAULT '', students_count INTEGER DEFAULT 0, status TEXT DEFAULT 'Active');
    CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, student_name TEXT, amount REAL NOT NULL, method TEXT, paid_at TEXT DEFAULT CURRENT_DATE, status TEXT DEFAULT 'Paid');
    CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, student_id INTEGER NOT NULL, attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not', UNIQUE(group_id, student_id, attendance_date));
    CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_name TEXT, action TEXT, target TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT DEFAULT '', author TEXT DEFAULT '', priority TEXT DEFAULT 'normal', created_at TEXT DEFAULT CURRENT_TIMESTAMP, is_read INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, capacity INTEGER DEFAULT 0, location TEXT DEFAULT '', status TEXT DEFAULT 'Active');
    CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, student_name TEXT DEFAULT '', group_name TEXT DEFAULT '', exam_type TEXT DEFAULT '', score REAL DEFAULT 0, max_score REAL DEFAULT 100, level TEXT DEFAULT '', taken_at TEXT DEFAULT CURRENT_DATE, note TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, student_name TEXT DEFAULT '', month TEXT NOT NULL, amount REAL DEFAULT 0, issue_date TEXT DEFAULT '', due_date TEXT DEFAULT '', status TEXT DEFAULT 'unpaid', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id, month));
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient TEXT DEFAULT '', channel TEXT DEFAULT 'SMS', subject TEXT DEFAULT '', body TEXT DEFAULT '', status TEXT DEFAULT 'sent', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `)
  const studentColumns = tableColumns('students')
  if (!studentColumns.includes('teacher_name')) db.exec("ALTER TABLE students ADD COLUMN teacher_name TEXT DEFAULT ''")
  if (!studentColumns.includes('level')) db.exec("ALTER TABLE students ADD COLUMN level TEXT DEFAULT ''")
  if (!studentColumns.includes('group_assigned_at')) db.exec("ALTER TABLE students ADD COLUMN group_assigned_at TEXT DEFAULT ''")
  if (!studentColumns.includes('parent_name')) db.exec("ALTER TABLE students ADD COLUMN parent_name TEXT DEFAULT ''")
  if (!studentColumns.includes('parent_phone')) db.exec("ALTER TABLE students ADD COLUMN parent_phone TEXT DEFAULT ''")
  db.exec("UPDATE students SET group_assigned_at = joined_at WHERE group_assigned_at IS NULL OR group_assigned_at = ''")
  const groupColumns = tableColumns('groups')
  if (!groupColumns.includes('schedule_days')) db.exec("ALTER TABLE groups ADD COLUMN schedule_days TEXT DEFAULT ''")
  if (!groupColumns.includes('schedule_time')) db.exec("ALTER TABLE groups ADD COLUMN schedule_time TEXT DEFAULT ''")
  if (!groupColumns.includes('room_name')) db.exec("ALTER TABLE groups ADD COLUMN room_name TEXT DEFAULT ''")
  const courseColumns = tableColumns('courses')
  if (!courseColumns.includes('monthly_fee')) db.exec("ALTER TABLE courses ADD COLUMN monthly_fee REAL DEFAULT 0")
  db.exec("UPDATE students SET teacher_name = '' WHERE teacher_name <> '' AND teacher_name NOT IN (SELECT name FROM teachers)")
  db.exec("UPDATE groups SET teacher = '' WHERE teacher <> '' AND teacher NOT IN (SELECT name FROM teachers)")
  const userColumns = tableColumns('users')
  if (!userColumns.includes('phone')) db.exec("ALTER TABLE users ADD COLUMN phone TEXT")
  const attendanceColumns = tableColumns('attendance')
  if (!attendanceColumns.includes('marked_by')) db.exec("ALTER TABLE attendance ADD COLUMN marked_by TEXT DEFAULT ''")
  if (!attendanceColumns.includes('created_at')) db.exec("ALTER TABLE attendance ADD COLUMN created_at TEXT DEFAULT ''")
  if (!attendanceColumns.includes('updated_at')) db.exec("ALTER TABLE attendance ADD COLUMN updated_at TEXT DEFAULT ''")
  db.exec(`
    UPDATE groups SET students_count = (SELECT COUNT(*) FROM students WHERE students.group_name = groups.name);
    UPDATE courses SET students_count = (SELECT COUNT(*) FROM students WHERE students.group_name IN (SELECT name FROM groups WHERE groups.course = courses.name));
    UPDATE teachers SET groups_count = (SELECT COUNT(*) FROM groups WHERE groups.teacher = teachers.name);
  `)
  const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (module, action) VALUES (?, ?)')
  for (const module of modules) for (const action of actions) insertPermission.run(module, action)
  const roleCount = db.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number }
  if (roleCount.count === 0) {
    const roleNames = ['Super Admin', 'Administrator', 'Academic Manager', 'Cashier', 'Accountant', 'Teacher']
    const addRole = db.prepare('INSERT INTO roles (name, description, is_system) VALUES (?, ?, 1)')
    const allPermissions = db.prepare('SELECT id FROM permissions').all() as { id: number }[]
    for (const name of roleNames) {
      const role = addRole.run(name, name === 'Super Admin' ? 'Full platform access' : 'Centre operations access')
      const permissionIds = name === 'Super Admin' ? allPermissions : fullViewPermissions(name) as { id: number }[]
      const addLink = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
      for (const permission of permissionIds) addLink.run(role.lastInsertRowid, permission.id)
    }
  }
  seedStaffAccounts()
  seedDemoData()
}

function fullViewPermissions(roleName: string): { id: number }[] {
  if (roleName === 'Teacher') {
    const viewModules = ['dashboard', 'students', 'groups', 'schedule', 'attendance', 'exams']
    const checks = viewModules.map((module) => `(module = '${module}' AND action = 'view')`).join(' OR ')
    const ids = db.prepare(`SELECT id FROM permissions WHERE ${checks} OR (module = 'attendance' AND action = 'create')`).all() as { id: number }[]
    return ids
  }
  return db.prepare("SELECT id FROM permissions WHERE action = 'view'").all() as { id: number }[]
}

function ensureRoleId(roleName: string): number {
  const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as { id: number } | undefined
  if (role) return role.id
  const result = db.prepare('INSERT INTO roles (name, description, is_system) VALUES (?, ?, 1)').run(roleName, 'Centre operations access')
  return Number(result.lastInsertRowid)
}

function ensureUser(name: string, phone: string, email: string, password: string, roleName: string) {
  const existing = db.prepare('SELECT id FROM (SELECT id, phone FROM users WHERE phone = ? UNION ALL SELECT id, email FROM users WHERE email = ?) LIMIT 1').all(phone, email)
  if (existing.length > 0) return
  const roleId = ensureRoleId(roleName)
  const defaultEmail = email || `${phone.replace(/\D/g, '')}@brightpath.local`
  db.prepare('INSERT INTO users (name, email, phone, password_hash, role_id) VALUES (?, ?, ?, ?, ?)').run(name, defaultEmail, phone, bcrypt.hashSync(password, 10), roleId)
}

function seedStaffAccounts() {
  ensureUser('Main Director', '+998900000000', 'director@brightpath.local', 'Director123!', 'Super Admin')
  ensureUser('Madina Aliyeva', '+998911111111', 'madina@brightpath.local', 'Teacher123!', 'Teacher')
  ensureUser('Sitora Nazarova', '+998922222222', 'sitora@brightpath.local', 'Cashier123!', 'Cashier')
}

function seedStamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export function ensureBackupsDir() {
  if (!fs.existsSync(backupsPath)) fs.mkdirSync(backupsPath, { recursive: true })
}

export async function createBackup(label: string): Promise<string> {
  ensureBackupsDir()
  const safe = label.replace(/[^a-z0-9-_]/gi, '-').slice(0, 40)
  const file = path.join(backupsPath, `centre-${seedStamp()}-${safe || 'manual'}.sqlite`)
  await db.backup(file)
  return path.basename(file)
}

export function listBackups() {
  ensureBackupsDir()
  return fs.readdirSync(backupsPath)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const stat = fs.statSync(path.join(backupsPath, name))
      return { name, size: stat.size, time: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.time.localeCompare(a.time))
}

export function restoreBackup(name: string) {
  const file = path.join(backupsPath, path.basename(name))
  if (!fs.existsSync(file)) throw new Error('Backup not found')
  db.close()
  fs.copyFileSync(file, dbPath)
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  migrate()
}

export function resetDemoData() {
  const tables = ['students', 'teachers', 'courses', 'groups', 'payments', 'attendance', 'reports', 'rooms', 'exams', 'invoices', 'messages', 'activity_log']
  const run = db.transaction(() => {
    for (const table of tables) db.exec(`DELETE FROM ${table}`)
  })
  run()
  seedDemoData()
}

function seedTableEmpty(table: string): boolean {
  return (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count === 0
}

function seedDemoData() {
  if (seedTableEmpty('students')) {
    const addStudent = db.prepare('INSERT INTO students (name, phone, parent_name, parent_phone, group_name, balance, attendance) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const students = [
      ['Amina Karimova', '+998 90 123 45 67', 'Dilnoza Karimova', '+998 90 123 45 00', 'IELTS Advanced / 01', 0, 96],
      ['Bekzod Tursunov', '+998 91 555 21 43', 'Oybek Tursunov', '+998 91 555 21 00', 'General English B2 / 04', 180000, 88],
      ['Laylo Abdullayeva', '+998 93 410 09 08', 'Nilufar Abdullayeva', '+998 93 410 09 00', 'IELTS Advanced / 01', 0, 100],
      ['Sardor Rakhimov', '+998 99 300 14 55', 'Gulnora Rakhimova', '+998 99 300 14 00', 'Young Learners A2 / 02', 360000, 78],
      ['Malika Yusupova', '+998 97 222 67 11', 'Aziz Yusupov', '+998 97 222 67 00', 'General English B2 / 04', 0, 94],
    ]
    for (const student of students) addStudent.run(...student)
  }
  if (seedTableEmpty('teachers')) {
    const addTeacher = db.prepare('INSERT INTO teachers (name, subject, groups_count) VALUES (?, ?, ?)')
    ;[['Madina Aliyeva', 'IELTS & Academic English', 4], ['James Wilson', 'General English', 6], ['Nodira Usmanova', 'Young Learners', 3]].forEach((teacher) => addTeacher.run(...teacher))
  }
  if (seedTableEmpty('courses')) {
    const addCourse = db.prepare('INSERT INTO courses (name, level, monthly_fee, students_count, color) VALUES (?, ?, ?, ?, ?)')
    ;[['IELTS Preparation', 'Advanced', 500000, 48, '#377d72'], ['General English', 'A1 – C1', 400000, 86, '#f0a35e'], ['Young Learners', 'A1 – B1', 350000, 35, '#d56b5d']].forEach((course) => addCourse.run(...course))
  }
  if (seedTableEmpty('groups')) {
    const addGroup = db.prepare('INSERT INTO groups (name, course, teacher, room_name, schedule, schedule_days, schedule_time, students_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    ;[
      ['IELTS Advanced / 01', 'IELTS Preparation', 'Madina Aliyeva', 'Room A', 'Mon, Wed, Fri · 18:30', 'Mon, Wed, Fri', '18:30', 18],
      ['General English B2 / 04', 'General English', 'James Wilson', 'Room B', 'Tue, Thu · 19:00', 'Tue, Thu', '19:00', 16],
      ['Young Learners A2 / 02', 'Young Learners', 'Nodira Usmanova', 'Room C', 'Sat, Sun · 10:00', 'Sat, Sun', '10:00', 12],
    ].forEach((group) => addGroup.run(...group))
  }
  if (seedTableEmpty('payments')) {
    const addPayment = db.prepare('INSERT INTO payments (student_name, amount, method, paid_at) VALUES (?, ?, ?, ?)')
    ;[['Amina Karimova', 1250000, 'Click', '2026-09-05'], ['Laylo Abdullayeva', 980000, 'Card', '2026-09-04'], ['Malika Yusupova', 850000, 'Payme', '2026-09-03']].forEach((payment) => addPayment.run(...payment))
  }
  if (seedTableEmpty('rooms')) {
    const addRoom = db.prepare('INSERT INTO rooms (name, capacity, location, status) VALUES (?, ?, ?, ?)')
    ;[['Room A', 20, 'Floor 1 · Main building', 'Active'], ['Room B', 18, 'Floor 1 · Main building', 'Active'], ['Room C', 24, 'Floor 2 · Main building', 'Active'], ['Computer Lab', 15, 'Floor 2 · Main building', 'Active']].forEach((room) => addRoom.run(...room))
  }
  if (seedTableEmpty('exams')) {
    const addExam = db.prepare('INSERT INTO exams (student_id, student_name, group_name, exam_type, score, max_score, level, taken_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    ;[['Amina Karimova', 'IELTS Advanced', 'Placement Test', 6.5, 9, 'Advanced', '2026-08-12'], ['Bekzod Tursunov', 'General English B2', 'Unit Test', 27, 30, 'Upper-Intermediate', '2026-08-20'], ['Laylo Abdullayeva', 'IELTS Advanced', 'Mock Speaking', 7, 9, 'Advanced', '2026-08-28']].forEach((exam) => { const student = db.prepare('SELECT id FROM students WHERE name = ?').get(exam[0]) as { id: number } | undefined; if (student) addExam.run(student.id, ...exam) })
  }
  if (seedTableEmpty('invoices')) {
    const addInvoice = db.prepare('INSERT OR IGNORE INTO invoices (student_id, student_name, month, amount, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    addInvoice.run((db.prepare('SELECT id FROM students WHERE name = ?').get('Bekzod Tursunov') as { id: number } | undefined)?.id ?? 2, 'Bekzod Tursunov', '2026-09', 360000, '2026-09-01', '2026-09-10', 'unpaid')
    addInvoice.run((db.prepare('SELECT id FROM students WHERE name = ?').get('Sardor Rakhimov') as { id: number } | undefined)?.id ?? 4, 'Sardor Rakhimov', '2026-09', 480000, '2026-09-01', '2026-09-10', 'unpaid')
  }
  if (seedTableEmpty('messages')) {
    const addMessage = db.prepare('INSERT INTO messages (recipient, channel, subject, body) VALUES (?, ?, ?, ?)')
    addMessage.run('Dilnoza Karimova', 'SMS', 'Receipt #1', 'Payment of 1 250 000 UZS received for Amina. Thank you for choosing BrightPath.')
    addMessage.run('All students', 'Telegram', 'September schedule', 'A reminder that lessons resume this week. See the timetable for your group.')
  }
}