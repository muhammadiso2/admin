import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { getDb, migrate, backupsPath, createBackup, listBackups, restoreBackup, resetDemoData } from './db.js'

migrate()
const app = express()
app.use(cors())
app.use(express.json())
const secret = process.env.JWT_SECRET ?? 'brightpath-education-centre-production-secret-change-me'
const db = getDb()

type AuthUser = {
  id: number
  name: string
  email: string
  phone: string
  role_id: number
  role_name: string
  password_hash: string
}
type AuthedRequest = express.Request & { user?: AuthUser; permissions?: Set<string> }

function authRequired(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Authentication required' })
  try {
    const payload = jwt.verify(token, secret) as { userId: number; roleId: number }
    const user = db.prepare('SELECT users.*, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role_id WHERE users.id = ?').get(payload.userId) as AuthUser | undefined
    if (!user) return res.status(401).json({ message: 'Account not found' })
    const perms = db.prepare('SELECT p.module, p.action FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?').all(user.role_id) as { module: string; action: string }[]
    req.user = user
    req.permissions = new Set(perms.map((p) => `${p.module}:${p.action}`))
    next()
  } catch {
    return res.status(401).json({ message: 'Session expired, please sign in again' })
  }
}

function can(moduleName: string, action: string) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    if (req.user?.role_name === 'Super Admin') return next()
    if (req.permissions?.has(`${moduleName}:${action}`)) return next()
    return res.status(403).json({ message: `You do not have permission to ${action} ${moduleName.replace(/_/g, ' ')}` })
  }
}

function superAdminOnly(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (req.user?.role_name !== 'Super Admin') return res.status(403).json({ message: 'Only the Main Director can perform this action' })
  next()
}

app.use((req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
  if (req.path === '/api/auth/login' || req.path === '/api/health') return next()
  return authRequired(req, res, next)
})

function logActivity(req: AuthedRequest, action: string, target: string) {
  db.prepare('INSERT INTO activity_log (user_name, action, target) VALUES (?, ?, ?)').run(req.user?.name ?? 'System', action, target.slice(0, 200))
}

function sendMessage(recipient: string, channel: string, subject: string, body: string) {
  if (!recipient?.trim()) return
  db.prepare('INSERT INTO messages (recipient, channel, subject, body) VALUES (?, ?, ?, ?)').run(recipient.trim(), channel, subject.trim(), body.trim())
}

const today = () => new Date().toISOString().slice(0, 10)
const currentMonth = () => new Date().toISOString().slice(0, 7)
function monthEnd(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month, 0)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function monthDiff(a: string): number {
  const now = new Date()
  const date = new Date(a.slice(0, 4) + '-' + a.slice(5, 7) + '-01')
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
}

function getStudentFinance(studentId: number, monthKey?: string) {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any
  if (!student) return null
  const group = db.prepare('SELECT * FROM groups WHERE name = ?').get(student.group_name) as any
  const course = group ? db.prepare('SELECT * FROM courses WHERE name = ?').get(group.course) as any : null
  const monthlyFee = Number(course?.monthly_fee ?? 0)
  const lessonPrice = monthlyFee / 12
  const key = monthKey ?? currentMonth()
  const first = `${key}-01`
  const last = monthEnd(key)
  const assignmentDate = String(student.group_assigned_at || student.joined_at || first).slice(0, 10)
  const effectiveStart = assignmentDate > first ? assignmentDate : first
  const records = group ? db.prepare('SELECT status FROM attendance WHERE group_id = ? AND student_id = ? AND attendance_date >= ? AND attendance_date <= ?').all(group.id, student.id, effectiveStart, last) as { status: string }[] : []
  const chargeableLessons = records.filter((record) => ['was', 'not', 'late'].includes(record.status)).length
  const requiredPayment = Math.round(chargeableLessons * lessonPrice)
  const paid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = ? AND substr(paid_at, 1, 7) = ?').get(student.id, key) as { total: number }
  return {
    monthly_fee: monthlyFee,
    lesson_price: lessonPrice,
    chargeable_lessons: chargeableLessons,
    required_payment: requiredPayment,
    paid_this_month: Number(paid.total),
    outstanding: Math.max(requiredPayment - Number(paid.total), 0),
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.post('/api/auth/login', (req, res) => {
  const phone = String(req.body.phone ?? '').replace(/\D/g, '')
  const password = String(req.body.password ?? '')
  const users = db.prepare('SELECT users.*, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role_id').all() as AuthUser[]
  const user = users.find((u) => (u.phone ?? '').replace(/\D/g, '') === phone)
  if (!phone || !user || !password || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ message: 'Invalid phone number or password' })
  const token = jwt.sign({ userId: user.id, roleId: user.role_id }, secret, { expiresIn: '12h' })
  const permissions = (db.prepare('SELECT p.module, p.action FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?').all(user.role_id) as { module: string; action: string }[]).map((p) => `${p.module}:${p.action}`)
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role_name, role_name: user.role_name }, permissions })
})
app.get('/api/auth/me', can('dashboard', 'view'), (req: AuthedRequest, res) => {
  const permissions = (db.prepare('SELECT p.module, p.action FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?').all(req.user!.role_id) as { module: string; action: string }[]).map((p) => `${p.module}:${p.action}`)
  res.json({ user: { id: req.user!.id, name: req.user!.name, email: req.user!.email, phone: req.user!.phone, role: req.user!.role_name, role_name: req.user!.role_name }, permissions })
})

app.get('/api/users', superAdminOnly, (_req, res) => res.json(db.prepare('SELECT users.id, users.name, users.email, users.phone, users.role_id, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role_id ORDER BY users.name').all()))
app.post('/api/users', superAdminOnly, (req, res) => {
  const { name, phone, password, role_name = 'Co Director' } = req.body
  if (!name?.trim() || !phone?.trim() || !password) return res.status(400).json({ message: 'Name, phone, and password are required' })
  let role = db.prepare('SELECT id FROM roles WHERE name = ?').get(role_name) as { id: number } | undefined
  if (!role) {
    const created = db.prepare('INSERT INTO roles (name, description, is_system) VALUES (?, ?, 0)').run(role_name, 'Director-created account')
    role = { id: Number(created.lastInsertRowid) }
    const viewPermissions = db.prepare("SELECT id FROM permissions WHERE action = 'view'").all() as { id: number }[]
    const addPermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
    for (const permission of viewPermissions) addPermission.run(role.id, permission.id)
  }
  try {
    const result = db.prepare('INSERT INTO users (name, email, phone, password_hash, role_id) VALUES (?, ?, ?, ?, ?)').run(name.trim(), `${phone.replace(/\D/g, '')}@brightpath.local`, phone.trim(), bcrypt.hashSync(password, 10), role.id)
    logActivity(req, 'created', `Staff account ${name.trim()}`)
    res.status(201).json(db.prepare('SELECT users.id, users.name, users.email, users.phone, users.role_id, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role_id WHERE users.id = ?').get(result.lastInsertRowid))
  } catch { res.status(409).json({ message: 'That phone number is already in use' }) }
})
app.patch('/api/users/:id', superAdminOnly, (req, res) => {
  const { name, phone, password, role_name } = req.body
  if (!name?.trim() || !phone?.trim()) return res.status(400).json({ message: 'Name and phone are required' })
  const user = db.prepare('SELECT id, role_id FROM users WHERE id = ?').get(req.params.id) as { id: number; role_id: number } | undefined
  if (!user) return res.status(404).json({ message: 'Account not found' })
  let roleId = user.role_id
  if (role_name) {
    const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(role_name) as { id: number } | undefined
    if (role) roleId = role.id
  }
  const email = `${phone.replace(/\D/g, '')}@brightpath.local`
  try {
    if (password) {
      db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, password_hash = ?, role_id = ? WHERE id = ?').run(name.trim(), email, phone.trim(), bcrypt.hashSync(password, 10), roleId, req.params.id)
    } else {
      db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, role_id = ? WHERE id = ?').run(name.trim(), email, phone.trim(), roleId, req.params.id)
    }
    logActivity(req, 'updated', `Staff account ${name.trim()}`)
    res.json(db.prepare('SELECT users.id, users.name, users.email, users.phone, users.role_id, roles.name as role_name FROM users LEFT JOIN roles ON roles.id = users.role_id WHERE users.id = ?').get(req.params.id))
  } catch { res.status(409).json({ message: 'That phone number is already in use' }) }
})
app.delete('/api/users/:id', superAdminOnly, (req, res) => {
  const user = db.prepare('SELECT id, role_id FROM users WHERE id = ?').get(req.params.id) as { id: number; role_id: number } | undefined
  if (!user) return res.status(404).json({ message: 'Account not found' })
  const superAdmin = db.prepare("SELECT id FROM roles WHERE name = 'Super Admin'").get() as { id: number }
  if (user.role_id === superAdmin.id) return res.status(400).json({ message: 'Super Admin accounts cannot be deleted' })
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  logActivity(req, 'deleted', `Staff account #${user.id}`)
  res.status(204).send()
})
app.get('/api/roles', superAdminOnly, (_req, res) => {
  const roles = db.prepare('SELECT * FROM roles ORDER BY name').all() as { id: number; name: string; description: string; is_system: number }[]
  const enriched = roles.map((role) => {
    const permissions = db.prepare('SELECT p.module, p.action FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?').all(role.id) as { module: string; action: string }[]
    return { ...role, permissions: permissions.map((p) => `${p.module}:${p.action}`) }
  })
  res.json(enriched)
})
app.put('/api/roles/:id/permissions', superAdminOnly, (req, res) => {
  const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(req.params.id) as { id: number; name: string } | undefined
  if (!role) return res.status(404).json({ message: 'Role not found' })
  if (role.name === 'Super Admin') return res.status(400).json({ message: 'Super Admin always has full access' })
  const selected = Array.isArray(req.body?.permissions) ? req.body.permissions.map((key: unknown) => String(key)) : []
  const set = new Set(selected.filter((key) => /^[a-z_]+:(view|create|edit|delete)$/.test(key)))
  const update = db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(req.params.id)
    const insert = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE module || ':' || action = ?`)
    for (const key of set) insert.run(req.params.id, key)
  })
  update()
  logActivity(req, 'updated role permissions', `Role ${role.name}`)
  const permissions = db.prepare('SELECT p.module, p.action FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?').all(req.params.id) as { module: string; action: string }[]
  res.json({ id: role.id, name: role.name, permissions: permissions.map((p) => `${p.module}:${p.action}`) })
})
app.get('/api/permissions', superAdminOnly, (_req, res) => res.json(db.prepare('SELECT * FROM permissions ORDER BY module, action').all()))

app.get('/api/students', can('students', 'view'), (req, res) => {
  const groupId = Number(req.query.group_id)
  let rows: unknown[]
  if (groupId) {
    const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId) as { name: string } | undefined
    if (!group) return res.json([])
    rows = db.prepare(`
      SELECT s.*,
        COALESCE(ROUND(100.0 * SUM(CASE WHEN a.status IN ('was','late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1), 0) as attendance,
        COUNT(a.id) as sessions
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id
      WHERE s.group_name = ? OR s.group_name LIKE ? OR ? LIKE s.group_name || '/%'
      GROUP BY s.id
      ORDER BY s.name
    `).all(group.name, `%${group.name.split(' /')[0]}%`, group.name)
  } else {
    rows = db.prepare(`
      SELECT s.*,
        COALESCE(ROUND(100.0 * SUM(CASE WHEN a.status IN ('was','late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1), 0) as attendance,
        COUNT(a.id) as sessions
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id
      GROUP BY s.id
      ORDER BY s.name
    `).all()
  }
  res.json(rows)
})
app.post('/api/students', can('students', 'create'), (req, res) => {
  const { name, phone = '', parent_name = '', parent_phone = '', group_name = '', teacher_name = '', level = '', balance = 0 } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Student name is required' })
  const result = db.prepare('INSERT INTO students (name, phone, parent_name, parent_phone, group_name, teacher_name, level, balance, attendance, group_assigned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)').run(name.trim(), phone.trim(), parent_name.trim(), parent_phone.trim(), group_name.trim(), teacher_name.trim(), level.trim(), Number(balance) || 0)
  const group = group_name.trim() ? db.prepare('SELECT id, course FROM groups WHERE name = ?').get(group_name.trim()) as { id: number; course: string } | undefined : undefined
  if (group) {
    db.prepare('UPDATE groups SET students_count = students_count + 1 WHERE id = ?').run(group.id)
    if (group.course) db.prepare('UPDATE courses SET students_count = students_count + 1 WHERE name = ?').run(group.course)
  }
  logActivity(req, 'created', `Student ${name.trim()}`)
  res.status(201).json({ ...(db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown> | undefined), attendance: 0, sessions: 0 })
})
app.patch('/api/students/:id', can('students', 'edit'), (req, res) => {
  const { name, phone = '', parent_name = '', parent_phone = '', group_name = '', teacher_name = '', level = '', balance = 0 } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Student name is required' })
  const existing = db.prepare('SELECT group_name FROM students WHERE id = ?').get(req.params.id) as { group_name: string } | undefined
  if (!existing) return res.status(404).json({ message: 'Student not found' })
  const assignmentChanged = existing.group_name !== group_name.trim()
  let newBalance = Number(balance) || 0
  const group = group_name.trim() ? db.prepare('SELECT id, course FROM groups WHERE name = ?').get(group_name.trim()) as { id: number; course: string } | undefined : undefined
  if (assignmentChanged && group) {
    const course = group.course ? db.prepare('SELECT monthly_fee FROM courses WHERE name = ?').get(group.course) as { monthly_fee: number } | undefined : null
    if (course) newBalance = -Number(course.monthly_fee || 0)
  }
  const updateStudent = db.transaction(() => {
    db.prepare(`UPDATE students SET name = ?, phone = ?, parent_name = ?, parent_phone = ?, group_name = ?, teacher_name = ?, level = ?, balance = ?${assignmentChanged ? ', group_assigned_at = CURRENT_TIMESTAMP' : ''} WHERE id = ?`).run(name.trim(), phone.trim(), parent_name.trim(), parent_phone.trim(), group_name.trim(), teacher_name.trim(), level.trim(), newBalance, req.params.id)
    if (assignmentChanged) {
      if (existing.group_name) {
        const oldGroup = db.prepare('SELECT id, course FROM groups WHERE name = ?').get(existing.group_name) as { id: number; course: string } | undefined
        if (oldGroup) {
          db.prepare('UPDATE groups SET students_count = MAX(students_count - 1, 0) WHERE id = ?').run(oldGroup.id)
          if (oldGroup.course) db.prepare('UPDATE courses SET students_count = MAX(students_count - 1, 0) WHERE name = ?').run(oldGroup.course)
        }
      }
      if (group) {
        db.prepare('UPDATE groups SET students_count = students_count + 1 WHERE id = ?').run(group.id)
        if (group.course) db.prepare('UPDATE courses SET students_count = students_count + 1 WHERE name = ?').run(group.course)
      }
    }
  })
  updateStudent()
  logActivity(req, 'updated', `Student ${name.trim()}`)
  res.json(db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id))
})
app.delete('/api/students/:id', can('students', 'delete'), (req, res) => {
  const student = db.prepare('SELECT id, group_name, name FROM students WHERE id = ?').get(req.params.id) as { id: number; group_name: string; name: string } | undefined
  if (!student) return res.status(404).json({ message: 'Student not found' })
  const deleteStudent = db.transaction(() => {
    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id)
    if (student.group_name) {
      const group = db.prepare('SELECT id, course FROM groups WHERE name = ?').get(student.group_name) as { id: number; course: string } | undefined
      if (group) {
        db.prepare('UPDATE groups SET students_count = MAX(students_count - 1, 0) WHERE id = ?').run(group.id)
        if (group.course) db.prepare('UPDATE courses SET students_count = MAX(students_count - 1, 0) WHERE name = ?').run(group.course)
      }
    }
  })
  deleteStudent()
  logActivity(req, 'deleted', `Student ${student.name}`)
  res.status(204).send()
})
app.get('/api/students/:id/finance', can('students', 'view'), (req, res) => {
  const finance = getStudentFinance(Number(req.params.id))
  if (!finance) return res.status(404).json({ message: 'Student not found' })
  res.json(finance)
})

app.get('/api/teachers', can('teachers', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM teachers ORDER BY name').all()))
app.post('/api/teachers', can('teachers', 'create'), (req, res) => {
  const { name, subject = '' } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Teacher name is required' })
  const result = db.prepare('INSERT INTO teachers (name, subject, groups_count) VALUES (?, ?, 0)').run(name.trim(), subject.trim())
  logActivity(req, 'created', `Teacher ${name.trim()}`)
  res.status(201).json(db.prepare('SELECT * FROM teachers WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/teachers/:id', can('teachers', 'edit'), (req, res) => {
  const { name, subject = '', status = 'Active' } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Teacher name is required' })
  const teacher = db.prepare('SELECT id FROM teachers WHERE id = ?').get(req.params.id)
  if (!teacher) return res.status(404).json({ message: 'Teacher not found' })
  const previous = db.prepare('SELECT name FROM teachers WHERE id = ?').get(req.params.id) as { name: string }
  const updateTeacher = db.transaction(() => {
    db.prepare('UPDATE teachers SET name = ?, subject = ?, status = ? WHERE id = ?').run(name.trim(), subject.trim(), status, req.params.id)
    db.prepare('UPDATE students SET teacher_name = ? WHERE teacher_name = ?').run(name.trim(), previous.name)
    db.prepare('UPDATE groups SET teacher = ? WHERE teacher = ?').run(name.trim(), previous.name)
  })
  updateTeacher()
  logActivity(req, 'updated', `Teacher ${name.trim()}`)
  res.json(db.prepare('SELECT * FROM teachers WHERE id = ?').get(req.params.id))
})
app.delete('/api/teachers/:id', can('teachers', 'delete'), (req, res) => {
  const teacher = db.prepare('SELECT id, name FROM teachers WHERE id = ?').get(req.params.id) as { id: number; name: string } | undefined
  if (!teacher) return res.status(404).json({ message: 'Teacher not found' })
  const deleteTeacher = db.transaction(() => {
    db.prepare('UPDATE students SET teacher_name = ? WHERE teacher_name = ?').run('', teacher.name)
    db.prepare('UPDATE groups SET teacher = ? WHERE teacher = ?').run('', teacher.name)
    db.prepare('DELETE FROM teachers WHERE id = ?').run(req.params.id)
  })
  deleteTeacher()
  logActivity(req, 'deleted', `Teacher ${teacher.name}`)
  res.status(204).send()
})

app.get('/api/groups', can('groups', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM groups ORDER BY name').all()))
app.post('/api/groups', can('groups', 'create'), (req, res) => {
  const { name, course = '', teacher = '', room_name = '', schedule = '', schedule_days = '', schedule_time = '' } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Group name is required' })
  const combinedSchedule = schedule.trim() || [schedule_days, schedule_time].filter(Boolean).join(' · ')
  const result = db.prepare('INSERT INTO groups (name, course, teacher, room_name, schedule, schedule_days, schedule_time, students_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0)').run(name.trim(), course.trim(), teacher.trim(), room_name.trim(), combinedSchedule, schedule_days.trim(), schedule_time.trim())
  logActivity(req, 'created', `Group ${name.trim()}`)
  res.status(201).json(db.prepare('SELECT * FROM groups WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/groups/:id', can('groups', 'edit'), (req, res) => {
  const { name, course = '', teacher = '', room_name = '', schedule = '', schedule_days = '', schedule_time = '', status = 'Active' } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Group name is required' })
  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(req.params.id)
  if (!group) return res.status(404).json({ message: 'Group not found' })
  const combinedSchedule = schedule.trim() || [schedule_days, schedule_time].filter(Boolean).join(' · ')
  db.prepare('UPDATE groups SET name = ?, course = ?, teacher = ?, room_name = ?, schedule = ?, schedule_days = ?, schedule_time = ?, status = ? WHERE id = ?').run(name.trim(), course.trim(), teacher.trim(), room_name.trim(), combinedSchedule, schedule_days.trim(), schedule_time.trim(), status, req.params.id)
  logActivity(req, 'updated', `Group ${name.trim()}`)
  res.json(db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id))
})
app.delete('/api/groups/:id', can('groups', 'delete'), (req, res) => {
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.id) as { id: number; name: string } | undefined
  if (!group) return res.status(404).json({ message: 'Group not found' })
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id)
  logActivity(req, 'deleted', `Group ${group.name}`)
  res.status(204).send()
})

app.get('/api/courses', can('courses', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM courses ORDER BY name').all()))
app.post('/api/courses', can('courses', 'create'), (req, res) => {
  const { name, level = '', monthly_fee = 0, color = '#377d72' } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Course name is required' })
  const result = db.prepare('INSERT INTO courses (name, level, monthly_fee, students_count, color) VALUES (?, ?, ?, 0, ?)').run(name.trim(), level.trim(), Number(monthly_fee) || 0, color)
  logActivity(req, 'created', `Course ${name.trim()}`)
  res.status(201).json(db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/courses/:id', can('courses', 'edit'), (req, res) => {
  const { name, level = '', monthly_fee = 0 } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Course name is required' })
  const course = db.prepare('SELECT id, name, color FROM courses WHERE id = ?').get(req.params.id) as { id: number; name: string; color: string } | undefined
  if (!course) return res.status(404).json({ message: 'Course not found' })
  db.prepare('UPDATE courses SET name = ?, level = ?, monthly_fee = ?, color = ? WHERE id = ?').run(name.trim(), level.trim(), Number(monthly_fee) || 0, course.color || '#377d72', req.params.id)
  if (name.trim() !== course.name) db.prepare('UPDATE groups SET course = ? WHERE course = ?').run(name.trim(), course.name)
  logActivity(req, 'updated', `Course ${name.trim()}`)
  res.json(db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id))
})
app.delete('/api/courses/:id', can('courses', 'delete'), (req, res) => {
  const course = db.prepare('SELECT id, name FROM courses WHERE id = ?').get(req.params.id) as { id: number; name: string } | undefined
  if (!course) return res.status(404).json({ message: 'Course not found' })
  const removeCourse = db.transaction(() => {
    db.prepare('UPDATE groups SET course = ? WHERE course = ?').run('', course.name)
    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id)
  })
  removeCourse()
  logActivity(req, 'deleted', `Course ${course.name}`)
  res.status(204).send()
})

app.get('/api/payments', can('payments', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM payments ORDER BY paid_at DESC').all()))
app.post('/api/payments', can('payments', 'create'), (req, res) => {
  const { student_id, student_name, amount, method = 'Cash' } = req.body
  if (!student_id || !student_name || !Number(amount)) return res.status(400).json({ message: 'Student and amount are required' })
  if (Number(amount) <= 0) return res.status(400).json({ message: 'Amount must be positive' })
  const result = db.prepare('INSERT INTO payments (student_id, student_name, amount, method) VALUES (?, ?, ?, ?)').run(student_id, student_name, Number(amount), method)
  db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?').run(Number(amount), student_id)
  db.prepare("UPDATE invoices SET status = 'paid' WHERE status = 'unpaid' AND student_id = ? AND month = substr(date('now'), 1, 7)").run(student_id)
  const student = db.prepare('SELECT parent_name, parent_phone FROM students WHERE id = ?').get(student_id) as { parent_name: string; parent_phone: string } | undefined
  if (student?.parent_phone) sendMessage(student.parent_name || student_name, 'SMS', `Receipt №${String(result.lastInsertRowid).padStart(7, '0')}`, `We received ${Number(amount).toLocaleString()} UZS from ${student_name}. Thank you for choosing BrightPath Education Centre.`)
  logActivity(req, 'recorded payment', `${student_name} · ${Number(amount).toLocaleString()} UZS`)
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/payments/:id', can('payments', 'edit'), (req, res) => {
  const { amount, method = 'Cash', status = 'Paid' } = req.body
  if (!Number(amount) || Number(amount) <= 0) return res.status(400).json({ message: 'Payment amount is required' })
  const payment = db.prepare('SELECT id, student_id, amount FROM payments WHERE id = ?').get(req.params.id) as { id: number; student_id: number; amount: number } | undefined
  if (!payment) return res.status(404).json({ message: 'Payment not found' })
  const newAmount = Number(amount)
  db.prepare('UPDATE payments SET amount = ?, method = ?, status = ? WHERE id = ?').run(newAmount, method, status, req.params.id)
  if (payment.student_id) db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?').run(payment.amount - newAmount, payment.student_id)
  logActivity(req, 'updated payment', `#${req.params.id} → ${newAmount.toLocaleString()} UZS`)
  res.json(db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id))
})
app.delete('/api/payments/:id', can('payments', 'delete'), (req, res) => {
  const payment = db.prepare('SELECT id, student_id, amount, student_name FROM payments WHERE id = ?').get(req.params.id) as { id: number; student_id: number | null; amount: number; student_name: string } | undefined
  if (!payment) return res.status(404).json({ message: 'Payment not found' })
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id)
  if (payment.student_id) db.prepare('UPDATE students SET balance = balance - ? WHERE id = ?').run(payment.amount, payment.student_id)
  logActivity(req, 'deleted payment', `${payment.student_name} · ${payment.amount.toLocaleString()} UZS`)
  res.status(204).send()
})

app.get('/api/attendance', can('attendance', 'view'), (req, res) => {
  const groupId = Number(req.query.group_id)
  if (!groupId) return res.status(400).json({ message: 'Group is required' })
  const month = String(req.query.month ?? '')
  if (/^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const end = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    return res.json(db.prepare('SELECT * FROM attendance WHERE group_id = ? AND attendance_date >= ? AND attendance_date <= ? ORDER BY attendance_date, student_id').all(groupId, start, end))
  }
  const date = String(req.query.date ?? today())
  res.json(db.prepare('SELECT * FROM attendance WHERE group_id = ? AND attendance_date = ?').all(groupId, date))
})
app.post('/api/attendance', can('attendance', 'create'), (req, res) => {
  const { group_id, student_id, attendance_date, status } = req.body
  const allowed = ['was', 'not', 'late', 'excused']
  if (!group_id || !student_id || !attendance_date || !allowed.includes(status)) return res.status(400).json({ message: 'Group, student, date, and a valid status are required' })
  if (String(attendance_date) > today()) return res.status(400).json({ message: 'Cannot mark attendance for a future date' })
  db.prepare(`
    INSERT INTO attendance (group_id, student_id, attendance_date, status, marked_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(group_id, student_id, attendance_date)
    DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by, updated_at = CURRENT_TIMESTAMP
  `).run(Number(group_id), Number(student_id), String(attendance_date), status, req.user?.name ?? '')
  if (status === 'not') {
    const student = db.prepare('SELECT name, parent_name, parent_phone FROM students WHERE id = ?').get(student_id) as { name: string; parent_name: string; parent_phone: string } | undefined
    if (student?.parent_phone) sendMessage(student.parent_name || student.name, 'SMS', 'Attendance alert', `${student.name} was marked absent on ${attendance_date}. Please call us if there is a reason.`)
  }
  res.json(db.prepare('SELECT * FROM attendance WHERE group_id = ? AND student_id = ? AND attendance_date = ?').get(group_id, student_id, attendance_date))
})
app.put('/api/attendance/:id', can('attendance', 'create'), (req, res) => {
  const record = db.prepare('SELECT id FROM attendance WHERE id = ?').get(req.params.id)
  if (!record) return res.status(404).json({ message: 'Record not found' })
  const { status } = req.body
  const allowed = ['was', 'not', 'late', 'excused']
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Valid status is required' })
  db.prepare('UPDATE attendance SET status = ?, marked_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.user?.name ?? '', req.params.id)
  res.json(db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id))
})
app.delete('/api/attendance/:id', can('attendance', 'create'), (req, res) => {
  const record = db.prepare('SELECT id FROM attendance WHERE id = ?').get(req.params.id)
  if (!record) return res.status(404).json({ message: 'Record not found' })
  db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id)
  res.status(204).send()
})
app.get('/api/attendance/summary', can('attendance', 'view'), (_req, res) => {
  const rows = db.prepare(`
    SELECT s.id as student_id, s.name, t.name as group_name,
      SUM(CASE WHEN a.status = 'was' THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late,
      SUM(CASE WHEN a.status = 'not' THEN 1 ELSE 0 END) as absent,
      SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) as excused,
      COUNT(a.id) as sessions
    FROM students s
    JOIN groups t ON t.name = s.group_name
    LEFT JOIN attendance a ON a.student_id = s.id
    GROUP BY s.id
    HAVING sessions > 0
    ORDER BY s.name
  `).all()
  res.json(rows)
})

app.get('/api/invoices', can('invoices', 'view'), (req, res) => {
  const month = String(req.query.month ?? currentMonth())
  res.json(db.prepare('SELECT * FROM invoices WHERE month = ? ORDER BY status ASC, id DESC').all(month))
})
app.post('/api/invoices/generate', can('invoices', 'create'), (req, res) => {
  const month = String(req.body.month ?? currentMonth())
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: 'Invalid month format (YYYY-MM)' })
  const students = db.prepare("SELECT id, name, group_name FROM students WHERE group_name <> ''").all() as { id: number; name: string; group_name: string }[]
  const insert = db.prepare('INSERT OR IGNORE INTO invoices (student_id, student_name, month, amount, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
  let created = 0
  let total = 0
  const run = db.transaction(() => {
    for (const student of students) {
      const finance = getStudentFinance(student.id, month)
      const amount = Math.round(finance && finance.required_payment > 0 ? finance.required_payment : (finance?.monthly_fee || 0))
      if (!amount) continue
      const result = insert.run(student.id, student.name, month, amount, `${month}-01`, `${month}-10`, 'unpaid')
      if (result.changes) {
        created += 1
        total += amount
        const parent = db.prepare('SELECT parent_name, parent_phone FROM students WHERE id = ?').get(student.id) as { parent_name: string; parent_phone: string } | undefined
        if (parent?.parent_phone) sendMessage(parent.parent_name || student.name, 'SMS', `Invoice ${month}`, `Your invoice for ${month} is ${amount.toLocaleString()} UZS. Due by ${month}-10. Thank you.`)
      }
    }
  })
  run()
  logActivity(req, 'generated invoices', `${month} · ${created} invoices · ${total.toLocaleString()} UZS`)
  res.json({ created, total, month })
})
app.patch('/api/invoices/:id', can('invoices', 'edit'), (req, res) => {
  const invoice = db.prepare('SELECT id FROM invoices WHERE id = ?').get(req.params.id)
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' })
  const status = req.body.status === 'paid' ? 'paid' : 'unpaid'
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, req.params.id)
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id))
})
app.delete('/api/invoices/:id', can('invoices', 'delete'), (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

app.get('/api/debts', can('debts', 'view'), (_req, res) => {
  const students = db.prepare("SELECT id, name, group_name, parent_name, parent_phone FROM students WHERE group_name <> ''").all() as { id: number; name: string; group_name: string; parent_name: string; parent_phone: string }[]
  const debts = [] as {
    student_id: number
    student_name: string
    group_name: string
    parent_name: string
    parent_phone: string
    current: number
    overdue30: number
    overdue60: number
    overdue90: number
    total: number
    oldest_due: string
  }[]
  for (const student of students) {
    const finance = getStudentFinance(student.id)
    const invoices = db.prepare("SELECT * FROM invoices WHERE student_id = ? AND status = 'unpaid'").all(student.id) as { amount: number; due_date: string; month: string }[]
    let overdue30 = 0, overdue60 = 0, overdue90 = 0
    let oldest = ''
    for (const invoice of invoices) {
      const diff = monthDiff(invoice.month)
      if (diff >= 3) overdue90 += invoice.amount
      else if (diff === 2) overdue60 += invoice.amount
      else overdue30 += invoice.amount
      if (!oldest || invoice.due_date < oldest) oldest = invoice.due_date
    }
    const current = finance?.outstanding ?? 0
    const total = current + invoices.reduce((sum, invoice) => sum + invoice.amount, 0)
    if (total <= 0) continue
    debts.push({ student_id: student.id, student_name: student.name, group_name: student.group_name, parent_name: student.parent_name, parent_phone: student.parent_phone, current, overdue30, overdue60, overdue90, total, oldest_due: oldest || '' })
  }
  debts.sort((a, b) => b.total - a.total)
  res.json(debts)
})

app.get('/api/exams', can('exams', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM exams ORDER BY taken_at DESC').all()))
app.post('/api/exams', can('exams', 'create'), (req, res) => {
  const { student_id, exam_type, score = 0, max_score = 100, level = '', taken_at = today(), note = '' } = req.body
  const student = db.prepare('SELECT id, name, group_name FROM students WHERE id = ?').get(student_id) as { id: number; name: string; group_name: string } | undefined
  if (!student) return res.status(400).json({ message: 'Choose a valid student' })
  if (!exam_type?.trim()) return res.status(400).json({ message: 'Exam type is required' })
  const result = db.prepare('INSERT INTO exams (student_id, student_name, group_name, exam_type, score, max_score, level, taken_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(student.id, student.name, student.group_name, exam_type.trim(), Number(score) || 0, Number(max_score) || 100, level.trim(), String(taken_at || today()).slice(0, 10), note.trim())
  logActivity(req, 'recorded exam', `${student.name} · ${exam_type.trim()}`)
  res.status(201).json(db.prepare('SELECT * FROM exams WHERE id = ?').get(result.lastInsertRowid))
})
app.delete('/api/exams/:id', can('exams', 'delete'), (req, res) => {
  db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

app.get('/api/rooms', can('rooms', 'view'), (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY name').all() as any[]
  const enriched = rooms.map((room) => {
    const group = db.prepare("SELECT name, schedule_days, schedule_time, students_count FROM groups WHERE room_name = ? AND status = 'Active' ORDER BY name").all(room.name) as { name: string; schedule_days: string; schedule_time: string; students_count: number }[]
    return { ...room, groups: group }
  })
  res.json(enriched)
})
app.post('/api/rooms', can('rooms', 'create'), (req, res) => {
  const { name, capacity = 0, location = '', status = 'Active' } = req.body
  if (!name?.trim()) return res.status(400).json({ message: 'Room name is required' })
  try {
    const result = db.prepare('INSERT INTO rooms (name, capacity, location, status) VALUES (?, ?, ?, ?)').run(name.trim(), Number(capacity) || 0, location.trim(), status)
    logActivity(req, 'created', `Room ${name.trim()}`)
    res.status(201).json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.lastInsertRowid))
  } catch { res.status(409).json({ message: 'A room with that name already exists' }) }
})
app.patch('/api/rooms/:id', can('rooms', 'edit'), (req, res) => {
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.id)
  if (!room) return res.status(404).json({ message: 'Room not found' })
  const { name, capacity = 0, location = '', status = 'Active' } = req.body
  db.prepare('UPDATE rooms SET name = ?, capacity = ?, location = ?, status = ? WHERE id = ?').run(name.trim(), Number(capacity) || 0, location.trim(), status, req.params.id)
  res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id))
})
app.delete('/api/rooms/:id', can('rooms', 'delete'), (req, res) => {
  const room = db.prepare('SELECT id, name FROM rooms WHERE id = ?').get(req.params.id) as { id: number; name: string } | undefined
  if (!room) return res.status(404).json({ message: 'Room not found' })
  db.prepare("UPDATE groups SET room_name = '' WHERE room_name = ?").run(room.name)
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id)
  logActivity(req, 'deleted', `Room ${room.name}`)
  res.status(204).send()
})

app.get('/api/messages', can('messages', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all()))
app.post('/api/messages/send', can('messages', 'create'), (req, res) => {
  const { recipient, channel = 'SMS', subject = '', body = '' } = req.body
  if (!recipient?.trim() || !body?.trim()) return res.status(400).json({ message: 'Recipient and message are required' })
  const result = db.prepare('INSERT INTO messages (recipient, channel, subject, body) VALUES (?, ?, ?, ?)').run(recipient.trim(), channel, subject.trim(), body.trim())
  logActivity(req, 'sent message', `${channel} → ${recipient.trim()}`)
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid))
})
app.delete('/api/messages/:id', can('messages', 'delete'), (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

app.get('/api/reports', can('reports', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM reports ORDER BY is_read ASC, created_at DESC').all()))
app.post('/api/reports', can('reports', 'create'), (req, res) => {
  const { title, message = '', author = 'Staff', priority = 'normal' } = req.body
  if (!title?.trim()) return res.status(400).json({ message: 'Report title is required' })
  const result = db.prepare('INSERT INTO reports (title, message, author, priority) VALUES (?, ?, ?, ?)').run(title.trim(), message.trim(), author.trim(), priority)
  logActivity(req, 'created report', title.trim())
  res.status(201).json(db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/reports/:id', can('reports', 'edit'), (req, res) => {
  const report = db.prepare('SELECT id FROM reports WHERE id = ?').get(req.params.id)
  if (!report) return res.status(404).json({ message: 'Report not found' })
  if (typeof req.body.is_read === 'boolean') db.prepare('UPDATE reports SET is_read = ? WHERE id = ?').run(req.body.is_read ? 1 : 0, req.params.id)
  res.json(db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id))
})
app.delete('/api/reports/:id', can('reports', 'delete'), (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

app.get('/api/activity', can('activity', 'view'), (_req, res) => res.json(db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 120').all()))

app.get('/api/dashboard', can('dashboard', 'view'), (_req, res) => {
  const date = today()
  const month = currentMonth()
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1)
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
  const present = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE attendance_date = ? AND status = 'was'").get(date) as { count: number }
  const late = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE attendance_date = ? AND status = 'late'").get(date) as { count: number }
  const absent = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE attendance_date = ? AND status = 'not'").get(date) as { count: number }
  const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE substr(paid_at, 1, 7) = ?").get(month) as { total: number }
  const previousRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE substr(paid_at, 1, 7) = ?").get(lastMonthKey) as { total: number }
  const unreadReports = db.prepare('SELECT COUNT(*) as count FROM reports WHERE is_read = 0').get() as { count: number }
  const unpaidInvoices = db.prepare("SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE status = 'unpaid'").get() as { total: number; count: number }
  const debtTotal = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = 'unpaid'").get() as { total: number }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const shortDays = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' }
  const todayName = dayNames[new Date().getDay()]
  const weekdayLessons = db.prepare('SELECT * FROM groups WHERE status = ? AND schedule_days LIKE ? ORDER BY schedule_time').all('Active', `%${shortDays[todayName as keyof typeof shortDays]}%`) as any[]
  const topDebtors = (db.prepare("SELECT student_name, SUM(amount) as total FROM invoices WHERE status = 'unpaid' GROUP BY student_id ORDER BY total DESC LIMIT 5").all() as { student_name: string; total: number }[])
  res.json({
    date,
    month,
    weekday_lessons: weekdayLessons,
    present_today: present.count,
    late_today: late.count,
    absent_today: absent.count,
    revenue,
    previous_revenue: previousRevenue.total,
    unread_reports: unreadReports.count,
    unpaid_invoices: unpaidInvoices.count,
    unpaid_invoices_total: unpaidInvoices.total,
    debt_total: debtTotal.total,
    top_debtors: topDebtors,
  })
})

app.get('/api/export/:kind', (req: AuthedRequest, res) => {
  const kind = String(req.params.kind)
  let rows: unknown[]
  if (kind === 'students') {
    if (!req.permissions?.has('students:view')) return res.status(403).json({ message: 'No permission to export students' })
    rows = db.prepare(`SELECT name, phone, parent_name, parent_phone, group_name, teacher_name, level, balance, attendance, status FROM students ORDER BY name`).all() as unknown[]
  } else if (kind === 'payments') {
    if (!req.permissions?.has('payments:view')) return res.status(403).json({ message: 'No permission to export payments' })
    rows = db.prepare('SELECT id, student_name, amount, method, paid_at, status FROM payments ORDER BY paid_at DESC').all() as unknown[]
  } else if (kind === 'invoices') {
    if (!req.permissions?.has('invoices:view')) return res.status(403).json({ message: 'No permission to export invoices' })
    rows = db.prepare('SELECT student_name, month, amount, issue_date, due_date, status FROM invoices ORDER BY month DESC').all() as unknown[]
  } else if (kind === 'attendance') {
    if (!req.permissions?.has('attendance:view')) return res.status(403).json({ message: 'No permission to export attendance' })
    rows = db.prepare('SELECT s.name, s.group_name, a.attendance_date, a.status FROM attendance a JOIN students s ON s.id = a.student_id ORDER BY a.attendance_date DESC').all() as unknown[]
  } else {
    return res.status(404).json({ message: 'Unknown export kind' })
  }
  const escape = (value: unknown) => { const text = value === null || value === undefined ? '' : String(value); return `"${text.replace(/"/g, '""')}"` }
  const header = Object.keys((rows[0] ?? {}) as Record<string, unknown>).map(escape).join(',')
  const lines = rows.map((row) => Object.values(row as Record<string, unknown>).map(escape).join(','))
  const csv = '\uFEFF' + [header, ...lines].join('\r\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-${today()}.csv"`)
  res.send(csv)
})

app.get('/api/system/backups', superAdminOnly, (_req, res) => res.json(listBackups()))
app.post('/api/system/backup', superAdminOnly, async (req, res) => {
  try {
    const file = await createBackup(req.body?.label ?? 'manual')
    logActivity(req, 'created backup', file)
    res.status(201).json({ file })
  } catch {
    res.status(500).json({ message: 'Backup failed' })
  }
})
app.get('/api/system/backup/file/:name', superAdminOnly, (req, res) => {
  const name = path.basename(String(req.params.name))
  const file = path.join(backupsPath, name)
  if (!fs.existsSync(file)) return res.status(404).json({ message: 'Backup not found' })
  res.download(file, name)
})
app.post('/api/system/restore/:name', superAdminOnly, (req, res) => {
  const name = path.basename(String(req.params.name))
  try {
    restoreBackup(name)
    logActivity(req, 'restored backup', name)
    res.json({ message: 'Backup restored — please restart the server', restart: true })
  } catch {
    res.status(500).json({ message: 'Restore failed — the server may need a restart' })
  }
})
app.post('/api/system/reset', superAdminOnly, (req, res) => {
  resetDemoData()
  logActivity(req, 'reset demo data', 'All records cleared and reseeded')
  res.json({ message: 'Demo data has been reset to the original seed' })
})

app.listen(3001, () => console.log('BrightPath API listening on http://localhost:3001'))