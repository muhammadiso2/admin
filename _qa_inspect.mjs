import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

const db = new Database('./server/centre.sqlite')
const users = db.prepare('SELECT id, name, email, phone, role_id, must_change_password, password_hash FROM users').all()
const cands = ['Director123!', 'Teacher123!', 'Cashier123!', 'Admin123!', 'Password123!', 'admin', 'Admin1234!', 'Director1234!', 'Harry123!', 'HarrySchool123!']
for (const u of users) {
  const match = cands.find((c) => bcrypt.compareSync(c, u.password_hash)) ?? '(unknown)'
  console.log(`#${u.id} ${u.name} | phone=${u.phone} | role_id=${u.role_id} | must_change=${u.must_change_password} | pw=${match}`)
}
console.log('--- counts ---')
for (const t of ['students', 'teachers', 'courses', 'groups', 'payments', 'attendance', 'rooms', 'exams', 'invoices', 'bills', 'messages', 'reports', 'activity_log', 'roles', 'permissions', 'role_permissions']) {
  const n = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n
  console.log(`${t}: ${n}`)
}
console.log('--- teacher role perms ---')
const tperm = db.prepare("SELECT p.module, p.action FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN roles r ON r.id=rp.role_id WHERE r.name='Teacher' ORDER BY p.module, p.action").all()
console.log(tperm.map((p) => `${p.module}:${p.action}`).join(', '))
