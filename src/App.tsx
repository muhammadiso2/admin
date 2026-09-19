import { useEffect, useState } from "react";
import { AttendanceModule } from "./attendance-module";
import { AttendanceDaysPicker } from "./attendance-days-picker";
import { parseAttendanceDays, initAttendanceDays, attendanceDaysToLegacy } from "./attendance-days";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  Download,
  FileBarChart,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import "./App.css";
import "./student-features.css";

type Module =
  | "Dashboard"
  | "Students"
  | "Groups"
  | "Teachers"
  | "Courses"
  | "Schedule"
  | "Attendance"
  | "Exams"
  | "Rooms"
  | "Payments"
  | "Invoices"
  | "Debts"
  | "Receipts"
| "Reports"
  | "Messages"
  | "Activity"
  | "Staff"
  | "System";
type Student = {
  id: number;
  name: string;
  phone: string;
  parent_name: string;
  parent_phone: string;
  group_name: string;
  teacher_name: string;
  level: string;
  status: string;
  balance: number;
  attendance: number;
  sessions: number;
};
type Payment = {
  id: number;
  student_id?: number;
  student_name: string;
  amount: number;
  method: string;
  paid_at: string;
  status: string;
};
type UserAccount = { id: number; name: string; email: string; phone: string; role_id: number; role_name: string };
type StaffRole = { id: number; name: string; description: string; is_system: number; permissions?: string[] };
type PermissionItem = { id: number; module: string; action: string };
type CreateType = "student" | "teacher" | "group" | "course" | "role" | "user" | "room";
type Teacher = { id: number; name: string; subject: string; groups_count: number; status: string };
type Group = { id: number; name: string; course: string; teacher: string; room_name: string; schedule: string; schedule_days: string; schedule_time: string; students_count: number; status: string };
type Course = { id: number; name: string; level: string; monthly_fee: number; students_count: number; color: string };
type StudentFinance = { monthly_fee: number; lesson_price: number; chargeable_lessons: number; required_payment: number; paid_this_month: number; outstanding: number };
type AttendanceRecord = { student_id: number; status: "was" | "not" | "late" | "excused"; attendance_date: string };
type Report = { id: number; title: string; message: string; author: string; priority: string; created_at: string; is_read: number };
type Invoice = { id: number; student_id: number; student_name: string; month: string; amount: number; issue_date: string; due_date: string; status: string };
type Exam = { id: number; student_id: number; student_name: string; group_name: string; exam_type: string; score: number; max_score: number; level: string; taken_at: string };
type Room = { id: number; name: string; capacity: number; location: string; status: string; groups: { name: string; schedule_days: string; schedule_time: string; students_count: number }[] };
type MessageItem = { id: number; recipient: string; channel: string; subject: string; body: string; status: string; created_at: string };
type ActivityItem = { id: number; user_name: string; action: string; target: string; created_at: string };
type DebtItem = { student_id: number; student_name: string; group_name: string; parent_name: string; parent_phone: string; current: number; overdue30: number; overdue60: number; overdue90: number; total: number; oldest_due: string };
type DashboardData = {
  date: string;
  month: string;
  present_today: number;
  late_today: number;
  absent_today: number;
  revenue: number;
  previous_revenue: number;
  unread_reports: number;
  unpaid_invoices: number;
  unpaid_invoices_total: number;
  debt_total: number;
  top_debtors: { student_name: string; total: number }[];
  weekday_lessons: { id: number; name: string; course: string; teacher: string; room_name: string; schedule_time: string; students_count: number }[];
};
type BackupItem = { name: string; size: number; time: string };
type SessionResult = { token: string; user: UserAccount; permissions: string[] };

const modules: Module[] = [
  "Dashboard",
  "Students",
  "Groups",
  "Teachers",
  "Courses",
  "Schedule",
  "Attendance",
  "Exams",
  "Rooms",
  "Payments",
  "Invoices",
  "Debts",
  "Receipts",
"Reports",
  "Messages",
  "Activity",
  "Staff",
  "System",
];
const icons = {
  Dashboard: LayoutDashboard,
  Students: Users,
  Groups: UserRound,
  Teachers: GraduationCap,
  Courses: BookOpen,
  Schedule: CalendarDays,
  Attendance: ClipboardCheck,
  Exams: Award,
  Rooms: DoorOpen,
  Payments: WalletCards,
  Invoices: FileText,
  Debts: TrendingUp,
  Receipts: Receipt,
Reports: FileBarChart,
  Messages: MessageSquare,
  Activity: History,
  Staff: ShieldCheck,
  System: Settings,
};
const money = (value: number) => new Intl.NumberFormat("en-US").format(value);
function fallbackStudent(payment: Payment): Student {
  return { id: payment.student_id ?? 0, name: payment.student_name, phone: "", parent_name: "", parent_phone: "", group_name: "", teacher_name: "", level: "", status: "Active", balance: 0, attendance: 0, sessions: 0 };
}
async function downloadCsv(kind: string) {
  const response = await fetch(`/api/export/${kind}`);
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${kind}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function buildRevenueChart(payments: Payment[]): { month: string; revenue: number }[] {
  const now = new Date();
  const points: { month: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const revenue = payments
      .filter((payment) => (payment.paid_at || "").startsWith(key))
      .reduce((total, payment) => total + payment.amount, 0);
    points.push({ month: date.toLocaleString("en-US", { month: "short" }), revenue });
  }
  return points;
}

function App() {
  const [active, setActive] = useState<Module>("Dashboard");
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [allPerms, setAllPerms] = useState<PermissionItem[]>([]);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [myPerms, setMyPerms] = useState<Set<string>>(new Set());
const [loaded, setLoaded] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [loginAccount, setLoginAccount] = useState<UserAccount | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<CreateType | null>(null);
  const [profile, setProfile] = useState<Student | null>(null);
  const [paymentStudent, setPaymentStudent] = useState<Student | null>(null);
  const [recordPayment, setRecordPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState<{ student: Student; payment?: Payment } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [addingExam, setAddingExam] = useState(false);
  const [addingReport, setAddingReport] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [generatingInvoices, setGeneratingInvoices] = useState(false);
  const [groupStudent, setGroupStudent] = useState<Student | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [staffModal, setStaffModal] = useState<{ mode: "create" } | { mode: "edit"; user: UserAccount } | null>(null);
  const [permissionRole, setPermissionRole] = useState<StaffRole | null>(null);

  const isTeacher = currentUser?.role_name === "Teacher";
  const myStudents = isTeacher ? students.filter((student) => student.teacher_name === currentUser?.name) : students;
  const myGroups = isTeacher ? groups.filter((group) => group.teacher === currentUser?.name) : groups;
  const myPayments = isTeacher ? payments.filter((payment) => myStudents.some((student) => student.id === payment.student_id || student.name === payment.student_name)) : payments;

  const loadData = () => {
    const get = async (url: string) => fetch(url).then((response) => response.ok ? response.json() : null).catch(() => null);
    return Promise.all([
      get("/api/students").then((result) => { if (result) setStudents(result); }),
      get("/api/payments").then((result) => { if (result) setPayments(result); }),
      get("/api/users").then((result) => { if (result) setUsers(result); }),
      get("/api/roles").then((result) => { if (result) setRoles(result); }),
      get("/api/permissions").then((result) => { if (result) setAllPerms(result); }),
      get("/api/teachers").then((result) => { if (result) setTeachers(result); }),
      get("/api/groups").then((result) => { if (result) setGroups(result); }),
      get("/api/courses").then((result) => { if (result) setCourses(result); }),
      get("/api/rooms").then((result) => { if (result) setRooms(result); }),
      get("/api/invoices").then((result) => { if (result) setInvoices(result); }),
      get("/api/exams").then((result) => { if (result) setExams(result); }),
      get("/api/messages").then((result) => { if (result) setMessages(result); }),
      get("/api/activity").then((result) => { if (result) setActivity(result); }),
      get("/api/debts").then((result) => { if (result) setDebts(result); }),
      get("/api/reports").then((result) => { if (result) setReports(result); }),
      get("/api/dashboard").then((result) => { if (result) setDashboard(result); }),
    ]).catch(() => undefined);
  };
  useEffect(() => {
    const token = localStorage.getItem("bp_token");
    if (!token) { setLoaded(true); return; }
    void fetch("/api/auth/me")
      .then((response) => response.ok ? response.json() : null)
      .then(async (me) => {
if (!me) {
          localStorage.removeItem("bp_token");
          setLoaded(true);
          return;
        }
        setCurrentUser(me.user);
        setMyPerms(new Set(me.permissions ?? []));
        await loadData();
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded && currentUser) void Promise.all([fetch("/api/invoices").then((r) => r.ok ? r.json() : null).then((r) => r && setInvoices(r)), fetch("/api/dashboard").then((r) => r.ok ? r.json() : null).then((r) => r && setDashboard(r))]);
  }, [invoiceMonth]);
  const filteredStudents = myStudents.filter((student) =>
    `${student.name} ${student.group_name} ${student.level}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const openModule = (module: Module) => {
    setActive(module);
    setMobileMenu(false);
  };
  const applySession = (result: SessionResult) => {
localStorage.setItem("bp_token", result.token);
    setCurrentUser(result.user);
    setMyPerms(new Set(result.permissions ?? []));
    void loadData();
  };
  const canView = (module: Module) => module === "Dashboard" || myPerms.size === 0 || myPerms.has(`${module.toLowerCase()}:view`);
  const canWriteAttendance = myPerms.size === 0 || myPerms.has("attendance:create");
  const navBadge = (dashboard?.unread_reports ?? 0) + (dashboard?.unpaid_invoices ?? 0);
  const handleLogout = () => {
localStorage.removeItem("bp_token");
    setCurrentUser(null);
    setMyPerms(new Set());
    setAccountMenu(false);
    setLoginAccount(null);
  };

  if (!loaded) return <div className="app-loading"><div className="brand"><div className="brand-mark">BP</div><div><strong>brightpath</strong><small>education centre</small></div></div><p className="muted">Loading workspace…</p></div>;
  if (!currentUser) return <LoginScreen onLogin={applySession} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">BP</div>
          <div>
            <strong>brightpath</strong>
            <small>education centre</small>
          </div>
          <button className="close-menu" onClick={() => setMobileMenu(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">Workspace</div>
        <nav className="nav-list">
          {modules.filter((item) => item === "System" ? currentUser?.role_name === "Super Admin" : item === "Staff" ? true : canView(item)).map((item) => {
            const Icon = icons[item];
            return (
              <button
                key={item}
                className={`nav-item ${active === item ? "active" : ""}`}
                onClick={() => openModule(item)}
              >
                <Icon size={18} />
                <span>{item}</span>
                {item === "Messages" && navBadge > 0 && <b className="nav-badge">{navBadge}</b>}
              </button>
            );
          })}
        </nav>
      </aside>
      {mobileMenu && (
        <button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)}>
            <MoreHorizontal size={21} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <b>/</b>
            <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <div className="search-box">
              <Search size={17} />
              <input
                placeholder="Search anything..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <Bell size={19} />
            <button className="profile profile-button" onClick={() => setAccountMenu((open) => !open)}><div className="avatar">{(currentUser?.name ?? "Main Director").split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><span>{currentUser?.name ?? "Main Director"}</span><ChevronDown size={15} /></button>
            {accountMenu && <div className="account-menu"><strong>Switch account</strong>{users.map((account) => <button key={account.id} onClick={() => { setLoginAccount(account); setAccountMenu(false); }}>{account.name}<small>{account.role_name} · {account.phone}</small></button>)}<div className="account-menu-divider" /><button className="account-logout" onClick={handleLogout}><LogOut size={14} /> Log out</button></div>}
          </div>
        </header>
        <div className="page-content">
          {profile ? <StudentProfile student={profile} teachers={teachers} groups={groups} payments={payments.filter((payment) => payment.student_id === profile.id || payment.student_name === profile.name)} close={() => setProfile(null)} onEdit={(student) => { setProfile(student); setStudents((items) => items.map((item) => item.id === student.id ? student : item)); void loadData(); }} onDelete={async () => { if (!window.confirm(`Delete ${profile.name}?`)) return; const response = await fetch(`/api/students/${profile.id}`, { method: "DELETE" }); if (response.ok) { setStudents((items) => items.filter((item) => item.id !== profile.id)); setProfile(null); void loadData(); } }} onPayment={() => setPaymentStudent(profile)} onAddGroup={() => setGroupStudent(profile)} onPrint={() => setPrintingReceipt({ student: profile, payment: payments.find((payment) => payment.student_id === profile.id || payment.student_name === profile.name) })} onDeletePayment={async (payment) => { if (!window.confirm(`Delete payment of ${money(payment.amount)} UZS for ${payment.student_name}?`)) return; const response = await fetch(`/api/payments/${payment.id}`, { method: "DELETE" }); if (response.ok) { setPayments((items) => items.filter((item) => item.id !== payment.id)); if (payment.student_id) { setStudents((items) => items.map((item) => item.id === payment.student_id ? { ...item, balance: item.balance - payment.amount } : item)); setProfile((current) => current && current.id === payment.student_id ? { ...current, balance: current.balance - payment.amount } : current); } void loadData(); } }} /> : selectedGroup ? <GroupPage group={selectedGroup} students={students.filter((student) => student.group_name === selectedGroup.name || selectedGroup.name.startsWith(student.group_name) || student.group_name.startsWith(selectedGroup.name.split(" /")[0]))} close={() => setSelectedGroup(null)} onStudentOpen={setProfile} onEdit={() => setEditingGroup(selectedGroup)} /> : selectedTeacher ? <TeacherPage teacher={selectedTeacher} groups={groups.filter((group) => group.teacher === selectedTeacher.name)} close={() => setSelectedTeacher(null)} onEdit={() => setEditingTeacher(selectedTeacher)} onGroupOpen={setSelectedGroup} /> : <>
          {active === "Dashboard" && (
            <Dashboard
              students={myStudents}
              payments={myPayments}
              dashboard={dashboard}
              showFinance={!isTeacher}
              userName={currentUser?.name ?? "Sarah"}
              onCreate={() => setModal("student")}
              onNavigate={openModule}
              onPrint={(payment) => setPrintingReceipt({ student: myStudents.find((student) => student.id === payment.student_id || student.name === payment.student_name) ?? fallbackStudent(payment), payment })}
            />
          )}
          {active === "Students" && (
            <StudentsPage
              students={filteredStudents}
              onExport={() => void downloadCsv("students")}
              onCreate={() => setModal("student")}
              onOpen={setProfile}
            />
          )}
          {active === "Payments" && <PaymentsPage payments={myPayments} onRecord={() => setRecordPayment(true)} onExport={() => void downloadCsv("payments")} onEdit={setEditingPayment} onPrint={(payment) => setPrintingReceipt({ student: students.find((student) => student.id === payment.student_id || student.name === payment.student_name) ?? fallbackStudent(payment), payment })} onDelete={async (payment) => { if (!window.confirm(`Delete payment of ${money(payment.amount)} UZS for ${payment.student_name}?`)) return; const response = await fetch(`/api/payments/${payment.id}`, { method: "DELETE" }); if (response.ok) { setPayments((items) => items.filter((item) => item.id !== payment.id)); if (payment.student_id) setStudents((items) => items.map((item) => item.id === payment.student_id ? { ...item, balance: item.balance - payment.amount } : item)); void loadData(); } }} />}
          {active === "Teachers" && <EntityPage title="Teachers" subtitle="Manage your teaching team and assigned groups." action={() => setModal("teacher")} actionLabel="Add teacher" columns={["Teacher", "Subject", "Groups", "Status"]} rows={teachers.map((teacher) => [teacher.name, teacher.subject || "Not set", String(teacher.groups_count), teacher.status])} onOpen={(index) => setSelectedTeacher(teachers[index])} onDelete={async (index) => { const teacher = teachers[index]; if (!window.confirm(`Delete ${teacher.name}?`)) return; const response = await fetch(`/api/teachers/${teacher.id}`, { method: "DELETE" }); if (response.ok) { setTeachers((items) => items.filter((item) => item.id !== teacher.id)); setStudents((items) => items.map((item) => item.teacher_name === teacher.name ? { ...item, teacher_name: "" } : item)); setGroups((items) => items.map((item) => item.teacher === teacher.name ? { ...item, teacher: "" } : item)); setSelectedTeacher(null); } }} />}
          {active === "Groups" && <EntityPage title="Groups" subtitle="Manage rosters, teachers, schedules, and group status." action={() => setModal("group")} actionLabel="Add group" columns={["Group", "Course", "Teacher", "Room", "Days", "Time", "Students"]} rows={myGroups.map((group) => [group.name, group.course || "Not set", group.teacher || "Not assigned", group.room_name || "Not set", groupDays(group), group.schedule_time || "Not set", String(group.students_count)])} onOpen={(index) => setSelectedGroup(myGroups[index])} onDelete={async (index) => { const group = myGroups[index]; if (!window.confirm(`Delete ${group.name}?`)) return; const response = await fetch(`/api/groups/${group.id}`, { method: "DELETE" }); if (response.ok) setGroups((items) => items.filter((item) => item.id !== group.id)); }} onDeleteLabel="Delete group" />}
          {active === "Courses" && <EntityPage title="Courses" subtitle="Manage the programmes and levels offered by your centre." action={() => setModal("course")} actionLabel="Add course" columns={["Course", "Level", "Price", "Students"]} rows={courses.map((course) => [course.name, course.level || "Not set", `${money(course.monthly_fee || 0)} UZS`, String(course.students_count)])} onEdit={(index) => setEditingCourse(courses[index])} onDelete={async (index) => { const course = courses[index]; if (!window.confirm(`Delete course "${course.name}"? Groups linked to it will lose this course.`)) return; const response = await fetch(`/api/courses/${course.id}`, { method: "DELETE" }); if (response.ok) { setCourses((items) => items.filter((item) => item.id !== course.id)); setGroups((items) => items.map((item) => item.course === course.name ? { ...item, course: "" } : item)); } }} onDeleteLabel="Delete course" />}
          {active === "Schedule" && <SchedulePage groups={myGroups} onOpen={setSelectedGroup} onCreate={() => setModal("group")} />}
          {active === "Attendance" && <AttendanceModule groups={myGroups} students={myStudents} markUserName={currentUser?.name ?? ""} canWrite={canWriteAttendance} />}
          {active === "Exams" && <ExamsPage exams={exams} onAdd={() => setAddingExam(true)} onDelete={async (exam) => { if (!window.confirm("Delete this exam record?")) return; const response = await fetch(`/api/exams/${exam.id}`, { method: "DELETE" }); if (response.ok) setExams((items) => items.filter((item) => item.id !== exam.id)); }} />}
          {active === "Rooms" && <RoomsPage rooms={rooms} groups={groups} onAdd={() => setModal("room")} onEdit={setEditingRoom} onDelete={async (room) => { if (!window.confirm(`Delete room ${room.name}?`)) return; const response = await fetch(`/api/rooms/${room.id}`, { method: "DELETE" }); if (response.ok) { setRooms((items) => items.filter((item) => item.id !== room.id)); setGroups((items) => items.map((item) => item.room_name === room.name ? { ...item, room_name: "" } : item)); } }} />}
          {active === "Invoices" && <InvoicesPage month={invoiceMonth} setMonth={setInvoiceMonth} invoices={invoices} busy={generatingInvoices} onGenerate={async () => { if (!window.confirm(`Generate invoices for ${invoiceMonth}?`)) return; setGeneratingInvoices(true); const response = await fetch("/api/invoices/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: invoiceMonth }) }); setGeneratingInvoices(false); if (response.ok) { const result = await response.json(); window.alert(`Generated ${result.created} invoices for ${money(result.total)} UZS`); void loadData(); } }} onMarkPaid={async (invoice) => { const response = await fetch(`/api/invoices/${invoice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: invoice.status === "paid" ? "unpaid" : "paid" }) }); if (response.ok) void loadData(); }} onDelete={async (invoice) => { if (!window.confirm("Delete this invoice?")) return; const response = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" }); if (response.ok) void loadData(); }} onExport={() => void downloadCsv("invoices")} />}
          {active === "Debts" && <DebtsPage debts={debts} students={students} onOpenStudent={setProfile} onNotify={async (debt) => { if (!debt.parent_phone) { window.alert("No parent phone is on file for this student."); return; } const response = await fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: debt.parent_name || debt.student_name, channel: "SMS", subject: "Payment reminder", body: `Dear parent, there is an outstanding balance of ${money(debt.total)} UZS for ${debt.student_name}. Please settle it at your earliest convenience. BrightPath Education Centre.` }) }); if (response.ok) { window.alert(`Reminder sent to ${debt.parent_name || debt.student_name}`); void loadData(); } }} />}
          {active === "Receipts" && <ReceiptsPage payments={myPayments} onPrint={(payment) => setPrintingReceipt({ student: students.find((student) => student.id === payment.student_id || student.name === payment.student_name) ?? fallbackStudent(payment), payment })} />}
          {active === "Reports" && <ReportsPage reports={reports} onAdd={() => setAddingReport(true)} onToggleRead={async (report) => { const response = await fetch(`/api/reports/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_read: !report.is_read }) }); if (response.ok) void loadData(); }} onDelete={async (report) => { if (!window.confirm("Delete this report?")) return; const response = await fetch(`/api/reports/${report.id}`, { method: "DELETE" }); if (response.ok) void loadData(); }} />}
          {active === "Messages" && <MessagesPage messages={messages} onSend={() => setSendingMessage(true)} onDelete={async (message) => { if (!window.confirm("Delete this message?")) return; const response = await fetch(`/api/messages/${message.id}`, { method: "DELETE" }); if (response.ok) setMessages((items) => items.filter((item) => item.id !== message.id)); }} />}
          {active === "Activity" && <ActivityPage activity={activity} />}
          {active === "Staff" && <StaffPage users={users} currentUser={currentUser} roles={roles} onCreate={() => setStaffModal({ mode: "create" })} onEdit={(user) => setStaffModal({ mode: "edit", user })} onEditPermissions={setPermissionRole} onDelete={async (user) => { if (user.id === currentUser?.id) { window.alert("You cannot delete your own account."); return; } if (!window.confirm(`Delete the staff account for ${user.name}? This cannot be undone.`)) return; const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" }); if (response.ok) { setUsers((items) => items.filter((item) => item.id !== user.id)); void loadData(); } else { window.alert((await response.json().catch(() => null))?.message ?? "Unable to delete account"); } }} />}
{active === "System" && <SystemPage onBackup={async () => { const response = await fetch("/api/system/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "manual" }) }); if (response.ok) window.alert("Backup created"); }} onRestore={async (backup) => { if (!window.confirm("Restore this backup? The server will need a restart afterwards.")) return; const response = await fetch(`/api/system/restore/${encodeURIComponent(backup.name)}`, { method: "POST" }); const result = await response.json(); window.alert(result.message ?? "Restore failed"); }} onReset={async () => { if (!window.confirm("Reset ALL data back to the demo seed? This cannot be undone.")) return; const response = await fetch("/api/system/reset", { method: "POST" }); if (response.ok) { await loadData(); window.alert("Demo data restored"); } }} />}
          </>}
        </div>
      </main>
      {modal && (
        <CreateModal
          type={modal}
          teachers={teachers}
          groups={groups}
          courses={courses}
          rooms={rooms}
          close={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void loadData();
          }}
        />
      )}
      {(paymentStudent || recordPayment) && (
        <PaymentModal
          student={paymentStudent ?? undefined}
          students={recordPayment ? students : undefined}
          close={() => { setPaymentStudent(null); setRecordPayment(false); }}
          onSaved={(result) => {
            setPaymentStudent(null);
            setRecordPayment(false);
            if (result.student_id) {
              setStudents((items) => items.map((item) => item.id === result.student_id ? { ...item, balance: item.balance + result.delta } : item));
              setProfile((current) => current && current.id === result.student_id ? { ...current, balance: current.balance + result.delta } : current);
            }
            void loadData();
          }}
        />
      )}
      {editingPayment && <PaymentModal payment={editingPayment} close={() => setEditingPayment(null)} onSaved={(result) => { if (result.student_id) { setStudents((items) => items.map((item) => item.id === result.student_id ? { ...item, balance: item.balance + result.delta } : item)); setProfile((current) => current && current.id === result.student_id ? { ...current, balance: current.balance + result.delta } : current); } setEditingPayment(null); void loadData(); }} />}
      {editingTeacher && <TeacherEditModal teacher={editingTeacher} close={() => setEditingTeacher(null)} onSaved={(teacher) => { setTeachers((items) => items.map((item) => item.id === teacher.id ? teacher : item)); setSelectedTeacher(teacher); setEditingTeacher(null); }} />}
      {editingGroup && <GroupEditModal group={editingGroup} teachers={teachers} rooms={rooms} close={() => setEditingGroup(null)} onSaved={(group) => { setGroups((items) => items.map((item) => item.id === group.id ? group : item)); setSelectedGroup(group); setEditingGroup(null); }} />}
        {editingCourse && <CourseEditModal course={editingCourse} close={() => setEditingCourse(null)} onSaved={(course) => { const previousName = editingCourse.name; setCourses((items) => items.map((item) => item.id === course.id ? course : item)); if (course.name !== previousName) setGroups((items) => items.map((item) => item.course === previousName ? { ...item, course: course.name } : item)); setEditingCourse(null); }} />}
        {editingRoom && <RoomEditModal room={editingRoom} close={() => setEditingRoom(null)} onSaved={(room) => { setRooms((items) => items.map((item) => item.id === room.id ? { ...item, ...room, groups: item.groups } : item)); setEditingRoom(null); }} />}
        {addingExam && <ExamModal students={students} close={() => setAddingExam(false)} onSaved={(exam) => { void loadData(); setAddingExam(false); if (exam) setExams((items) => [exam, ...items].slice(0, 200)); }} />}
        {addingReport && <ReportModal currentUser={currentUser} close={() => setAddingReport(false)} onSaved={() => { setAddingReport(false); void loadData(); }} />}
        {sendingMessage && <SendMessageModal students={students} close={() => setSendingMessage(false)} onSaved={() => { setSendingMessage(false); void loadData(); }} />}
        {groupStudent && <GroupAssignmentModal student={groupStudent} groups={groups} close={() => setGroupStudent(null)} onSaved={(student) => { setStudents((items) => items.map((item) => item.id === student.id ? student : item)); setProfile(student); setGroupStudent(null); void loadData(); }} />}
        {loginAccount && <LoginModal account={loginAccount} close={() => setLoginAccount(null)} onSuccess={(result) => { applySession(result); setLoginAccount(null); }} />}
      {staffModal && <StaffModal mode={staffModal.mode} user={staffModal.mode === "edit" ? staffModal.user : undefined} roles={roles} close={() => setStaffModal(null)} onSaved={(user) => { setStaffModal(null); setUsers((items) => { const exists = items.some((item) => item.id === user.id); return exists ? items.map((item) => item.id === user.id ? user : item) : [user, ...items]; }); void loadData(); }} />}
      {permissionRole && <RolePermissionsModal role={permissionRole} allPerms={allPerms} close={() => setPermissionRole(null)} onSaved={(role) => { setRoles((items) => items.map((item) => item.id === role.id ? { ...item, permissions: role.permissions } : item)); setPermissionRole(null); void loadData(); }} />}
      {printingReceipt && <ReceiptPrint student={printingReceipt.student} payment={printingReceipt.payment} operatorName={currentUser?.name ?? "Main Director"} onDone={() => setPrintingReceipt(null)} />}
    </div>
  );
}

function Dashboard({
  students,
  payments,
  dashboard,
  showFinance,
  userName,
  onCreate,
  onNavigate,
  onPrint,
}: {
  students: Student[];
  payments: Payment[];
  dashboard: DashboardData | null;
  showFinance: boolean;
  userName: string;
  onCreate: () => void;
  onNavigate: (module: Module) => void;
  onPrint: (payment: Payment) => void;
}) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const eyebrow = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const currentMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const revenue = dashboard?.revenue ?? payments.filter((payment) => (payment.paid_at || "").startsWith(currentMonth)).reduce((total, payment) => total + payment.amount, 0);
  const previousRevenue = dashboard?.previous_revenue ?? payments.filter((payment) => (payment.paid_at || "").startsWith(lastMonth)).reduce((total, payment) => total + payment.amount, 0);
  const avgAttendance = students.length ? Math.round(students.reduce((total, student) => total + student.attendance, 0) / students.length) : 0;
  const markedToday = (dashboard?.present_today ?? 0) + (dashboard?.late_today ?? 0) + (dashboard?.absent_today ?? 0);
  const presentToday = markedToday > 0 ? Math.round(((dashboard?.present_today ?? 0) / markedToday) * 100) : avgAttendance;
  const outstanding = dashboard?.debt_total ?? 0;
  const unpaidCount = dashboard?.unpaid_invoices ?? 0;
  const revenueChange = previousRevenue > 0 ? `${Math.abs(Math.round(((revenue - previousRevenue) / previousRevenue) * 100))}% ${revenue >= previousRevenue ? "↑" : "↓"} vs last month` : "vs last month";
  const compact = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : `${Math.round(value)}`;
  const chartData = buildRevenueChart(payments);
  const todayLessons = dashboard?.weekday_lessons ?? [];
  return (
    <>
      <PageHeading
        eyebrow={eyebrow}
        title={`${greeting}, ${userName.split(" ")[0] ?? "Sarah"} ✦`}
        subtitle="Here is what's happening at BrightPath today."
        action={
          <button className="primary-button" onClick={onCreate}>
            <Plus size={17} /> Add student
          </button>
        }
      />
      <div className="stat-grid">
        <Stat
          label="Total students"
          value={money(students.length)}
          icon={<Users />}
          color="teal"
        />
        {showFinance ? (
          <Stat
            label="Monthly revenue"
            value={`${money(revenue)} UZS`}
            icon={<WalletCards />}
            color="orange"
            change={revenueChange}
          />
        ) : (
          <Stat
            label="Lessons today"
            value={String(todayLessons.length)}
            icon={<CalendarDays />}
            color="orange"
          />
        )}
        <Stat
          label="Attendance today"
          value={`${presentToday}%`}
          icon={<ClipboardCheck />}
          color="blue"
        />
        {showFinance ? (
          <Stat
            label="Outstanding debt"
            value={`${compact(outstanding)} UZS`}
            icon={<CreditCard />}
            color="red"
            change={`${unpaidCount} unpaid invoice${unpaidCount === 1 ? "" : "s"}`}
          />
        ) : (
          <Stat
            label="My groups"
            value={String(students.reduce((total, student) => total + (student.group_name ? 1 : 0), 0))}
            icon={<UserRound />}
            color="red"
          />
        )}
      </div>
      <div className="dashboard-grid">
        {showFinance ? (
          <section className="panel revenue-panel">
            <PanelHead
              title="Revenue overview"
              subtitle="Monthly revenue performance"
            />
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={255}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#377d72"
                    fill="#dceee8"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : (
          <section className="panel revenue-panel">
            <PanelHead
              title="Today's lessons"
              subtitle="Your scheduled groups for today"
            />
            <div className="today-lessons">
              {todayLessons.length ? todayLessons.map((lesson) => (
                <div className="lesson-row" key={lesson.id}>
                  <span className="status-pill paid">{lesson.schedule_time || "All day"}</span>
                  <strong>{lesson.name}</strong>
                  <span className="muted">{lesson.room_name || "No room"} · {lesson.students_count} students</span>
                </div>
              )) : <p className="muted">No lessons scheduled today.</p>}
            </div>
          </section>
        )}
        <section className="panel attendance-panel">
          <PanelHead
            title="Attendance today"
            subtitle={`${dashboard?.present_today ?? 0} present · ${dashboard?.late_today ?? 0} late · ${dashboard?.absent_today ?? 0} absent`}
          />
          <div className="attendance-ring">
            <div>
              <strong>{presentToday}%</strong>
              <span>present</span>
            </div>
          </div>
          <button
            className="text-button"
            onClick={() => onNavigate("Attendance")}
          >
            View attendance
          </button>
        </section>
      </div>
      {showFinance && (
        <section className="panel table-panel">
          <PanelHead
            title="Recent payments"
            subtitle="Latest transactions across the centre"
          />
          <PaymentTable payments={payments} onPrint={onPrint} />
        </section>
      )}
      {!showFinance && (
        <section className="panel table-panel page-panel">
          <PanelHead
            title="Top debtors"
            subtitle="Students with the highest outstanding balances"
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.top_debtors ?? []).length ? dashboard!.top_debtors.map((debtor, index) => (
                  <tr key={`${debtor.student_name}-${index}`}>
                    <td><strong>{debtor.student_name}</strong></td>
                    <td className="balance-due">{money(debtor.total)} UZS</td>
                  </tr>
                )) : <tr><td colSpan={2}>No outstanding balances. Great job!</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function PanelHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
      </div>
      <MoreHorizontal size={19} />
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  color,
  change,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  change?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      {change && <span className="stat-change up">{change}</span>}
    </div>
  );
}
function StudentsPage({
  students,
  onExport,
  onCreate,
  onOpen,
}: {
  students: Student[];
  onExport: () => void;
  onCreate: () => void;
  onOpen: (student: Student) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="People & records"
        title="Students"
        subtitle="Manage enrolment, payments, attendance and performance."
        action={
          <div className="heading-actions">
            <button className="secondary-button" onClick={onExport}>
              <Download size={15} /> Export CSV
            </button>
            <button className="primary-button" onClick={onCreate}>
              <Plus size={17} /> Add student
            </button>
          </div>
        }
      />
      <section className="panel table-panel page-panel">
        <PanelHead
          title={`All students (${students.length})`}
          subtitle="Click a student to open their profile"
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Level</th>
                <th>Teacher</th>
                <th>Group</th>
                <th>Attendance</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr
                  key={student.id}
                  className="clickable-row"
                  onClick={() => onOpen(student)}
                >
                  <td>
                    <div className="table-person">
                      <div className="avatar small">
                        {student.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <strong>{student.name}</strong>
                        <small>{student.phone}</small>
                      </div>
                    </div>
                  </td>
                  <td>{student.level || "Not set"}</td>
                  <td>{student.teacher_name || "Not assigned"}</td>
                  <td>{student.group_name || "Not assigned"}</td>
                  <td>{student.attendance}%</td>
                  <td
                    className={
                      student.balance < 0 ? "balance-due" : "balance-clear"
                    }
                  >
                    {student.balance < 0 ? `-${money(-student.balance)} UZS` : student.balance > 0 ? `+${money(student.balance)} UZS` : "Paid"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function PaymentTable({ payments, onEdit, onPrint, onDelete }: { payments: Payment[]; onEdit?: (payment: Payment) => void; onPrint?: (payment: Payment) => void; onDelete?: (payment: Payment) => void }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Date</th>
            <th>Status</th>
            {(onEdit || onDelete) && <th>Actions</th>}
            {onPrint && <th>Receipt</th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{payment.student_name}</td>
              <td className="amount">{money(payment.amount)} UZS</td>
              <td>{payment.method}</td>
              <td>{payment.paid_at}</td>
              <td>
                <span className="status-pill paid">{payment.status}</span>
              </td>
              {(onEdit || onDelete) && <td className="row-actions">{onEdit && <button className="secondary-button table-action" onClick={() => onEdit(payment)}>Edit</button>}{onDelete && <button className="danger-button table-action" title="Delete payment" onClick={() => onDelete(payment)}><Trash2 size={15} /></button>}</td>}
              {onPrint && <td><button className="secondary-button table-action" onClick={() => onPrint(payment)}><Receipt size={14} /> Print</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PaymentsPage({ payments, onRecord, onExport, onEdit, onPrint, onDelete }: { payments: Payment[]; onRecord: () => void; onExport: () => void; onEdit: (payment: Payment) => void; onPrint: (payment: Payment) => void; onDelete?: (payment: Payment) => void | Promise<void> }) {
  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Payments"
        subtitle="Track revenue, outstanding balances and payment methods."
        action={
          <div className="heading-actions">
            <button className="secondary-button" onClick={onExport}>
              <Download size={15} /> Export CSV
            </button>
            <button className="primary-button" onClick={onRecord}>
              <Plus size={17} /> Record payment
            </button>
          </div>
        }
      />
      <section className="panel table-panel page-panel">
        <PanelHead
          title="Payment transactions"
          subtitle="All recent payments"
        />
        <PaymentTable payments={payments} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
      </section>
    </>
  );
}
function EntityPage({ title, subtitle, action, actionLabel, columns, rows, onOpen, onEdit, onDelete, onDeleteLabel = "Delete" }: { title: string; subtitle: string; action: () => void; actionLabel: string; columns: string[]; rows: string[][]; onOpen?: (index: number) => void; onEdit?: (index: number) => void; onDelete?: (index: number) => void | Promise<void>; onDeleteLabel?: string }) {
  return <><PageHeading eyebrow="BrightPath workspace" title={title} subtitle={subtitle} action={<button className="primary-button" onClick={action}><Plus size={17} /> {actionLabel}</button>} /><section className="panel table-panel page-panel"><PanelHead title={`${title} (${rows.length})`} subtitle={onOpen ? "Click a row to open its page" : "Saved records from your centre"} /><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{(onEdit || onDelete) && <th>Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr className={onOpen ? "clickable-row" : undefined} key={`${row[0]}-${index}`} onClick={() => onOpen?.(index)}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}{(onEdit || onDelete) && <td className="row-actions">{onEdit && <button className="secondary-button table-action" title="Edit" onClick={(event) => { event.stopPropagation(); onEdit(index) }}><Pencil size={13} /></button>}{onDelete && <button className="danger-button table-action" title={onDeleteLabel} onClick={(event) => { event.stopPropagation(); void onDelete(index) }}><Trash2 size={15} /></button>}</td>}</tr>)}</tbody></table></div></section></>
}
function TeacherPage({ teacher, groups, close, onEdit, onGroupOpen }: { teacher: Teacher; groups: Group[]; close: () => void; onEdit: () => void; onGroupOpen: (group: Group) => void }) {
  return <div className="student-profile-page"><div className="profile-page-head"><button className="secondary-button" onClick={close}>← Back to teachers</button><span className="status-pill paid">{teacher.status}</span></div><PageHeading eyebrow="Teacher workspace" title={teacher.name} subtitle={teacher.subject || "Subject not set"} action={<button className="secondary-button" onClick={onEdit}>Edit teacher</button>} /><div className="profile-summary"><div><span>Subject</span><strong>{teacher.subject || "Not set"}</strong></div><div><span>Assigned groups</span><strong>{groups.length}</strong></div><div><span>Total students</span><strong>{groups.reduce((total, group) => total + group.students_count, 0)}</strong></div><div><span>Status</span><strong>{teacher.status}</strong></div></div><section className="panel table-panel page-panel"><PanelHead title={`Groups taught by ${teacher.name}`} subtitle="Click a group to open its page" /><div className="table-scroll"><table><thead><tr><th>Group</th><th>Course</th><th>Schedule</th><th>Time</th><th>Students</th></tr></thead><tbody>{groups.length ? groups.map((group) => <tr className="clickable-row" key={group.id} onClick={() => onGroupOpen(group)}><td><strong>{group.name}</strong></td><td>{group.course || "Not set"}</td><td>{groupDays(group)}</td><td>{group.schedule_time || "Not set"}</td><td>{group.students_count}</td></tr>) : <tr><td colSpan={5}>No groups are assigned to this teacher yet.</td></tr>}</tbody></table></div></section></div>
}
function GroupPage({ group, students, close, onStudentOpen, onEdit }: { group: Group; students: Student[]; close: () => void; onStudentOpen: (student: Student) => void; onEdit: () => void }) {
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendance, setAttendance] = useState<Record<number, AttendanceRecord["status"]>>({});
  useEffect(() => { fetch(`/api/attendance?group_id=${group.id}&date=${attendanceDate}`).then((response) => response.json()).then((records: AttendanceRecord[]) => setAttendance(Object.fromEntries(records.map((record) => [record.student_id, record.status])))).catch(() => undefined); }, [group.id, attendanceDate]);
  const saveAttendance = async (studentId: number, status: AttendanceRecord["status"]) => { setAttendance((current) => ({ ...current, [studentId]: status })); await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: group.id, student_id: studentId, attendance_date: attendanceDate, status }) }); };
  return <div className="student-profile-page"><div className="profile-page-head"><button className="secondary-button" onClick={close}>← Back to groups</button><span className="status-pill paid">{group.status}</span></div><PageHeading eyebrow="Group workspace" title={group.name} subtitle={`${group.course || "Course not assigned"} · ${group.teacher || "Teacher not assigned"}`} action={<button className="secondary-button" onClick={onEdit}>Edit group</button>} /><div className="profile-summary"><div><span>Schedule</span><strong>{groupDays(group)}</strong></div><div><span>Time</span><strong>{group.schedule_time || "Not set"}</strong></div><div><span>Course</span><strong>{group.course || "Not set"}</strong></div><div><span>Students</span><strong>{students.length}</strong></div></div><section className="panel table-panel page-panel"><div className="panel-head"><div><h2>Attendance</h2><p className="muted">Mark each student for this lesson date</p></div><input className="attendance-date" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></div><div className="table-scroll"><table><thead><tr><th>Student</th><th>Level</th><th>Attendance</th></tr></thead><tbody>{students.length ? students.map((student) => <tr key={student.id}><td><button className="student-link" onClick={() => onStudentOpen(student)}>{student.name}</button></td><td>{student.level || "Not set"}</td><td><select className="attendance-select" value={attendance[student.id] ?? "not"} onChange={(event) => void saveAttendance(student.id, event.target.value as AttendanceRecord["status"])}><option value="was">Was</option><option value="not">Not</option><option value="late">Late</option><option value="excused">Excused</option></select></td></tr>) : <tr><td colSpan={3}>No students are assigned to this group yet.</td></tr>}</tbody></table></div></section></div>
}
function parseTime(raw: string): number | null {
  if (!raw) return null;
  const twelve = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(raw);
  if (twelve) {
    let hours = Number(twelve[1]) % 12;
    if (twelve[3].toLowerCase() === "pm") hours += 12;
    return hours * 60 + Number(twelve[2] || 0);
  }
  const twentyFour = /(\d{1,2}):(\d{2})/.exec(raw);
  if (twentyFour) return Number(twentyFour[1]) * 60 + Number(twentyFour[2]);
  return null;
}
function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 12 || 12;
  const suffix = minutes >= 720 ? "PM" : "AM";
  return `${hour}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}
function lessonTimes(group: Group): { start: number; end: number } | null {
  const raw = group.schedule_time || (group.schedule || "").split("·")[1]?.trim() || "";
  const start = parseTime(raw);
  return start === null ? null : { start, end: start + 90 };
}
function groupDays(group: Group): string {
  const raw = group.schedule_days || (group.schedule || "").split("·")[0]?.trim() || "";
  return attendanceDaysToLegacy(raw) || raw || "Not set";
}
function SchedulePage({ groups, onOpen, onCreate }: { groups: Group[]; onOpen: (group: Group) => void; onCreate: () => void }) {
  const palette = ["#377d72", "#e8ad64", "#d56b5d", "#5a7db0", "#7a77b5", "#4a988a"];
  const conflicts: [Group, Group][] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      const ta = lessonTimes(a);
      const tb = lessonTimes(b);
      if (!a.room_name || !b.room_name || a.room_name !== b.room_name) continue;
      if (a.schedule_days && b.schedule_days && a.schedule_days !== b.schedule_days) continue;
      if (ta && tb && !(ta.start >= tb.end || tb.start >= ta.end)) conflicts.push([a, b]);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Timetable"
        title="Schedule"
        subtitle={`${groups.length} groups on your timetable — lesson days, rooms, start and end times.`}
        action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Add group</button>}
      />
      {conflicts.length > 0 && (
        <div className="conflict-banner">
          <AlertTriangle size={17} />
          <div>
            <strong>Schedule conflicts detected</strong>
            {conflicts.map(([a, b], index) => (
              <p key={index} className="muted">{a.name} and {b.name} share {a.room_name} · {a.schedule_days} · {a.schedule_time || "same time"}</p>
            ))}
          </div>
        </div>
      )}
      {groups.length ? (
        <div className="schedule-grid">
          {groups.map((group) => {
            const times = lessonTimes(group);
            const color = palette[group.id % palette.length];
            return (
              <button key={group.id} className="schedule-card" style={{ "--schedule-color": color } as React.CSSProperties} onClick={() => onOpen(group)}>
                <div className="schedule-card-top">
                  <span className="schedule-kind">{group.course || "Group"}</span>
                  <span className="status-pill paid">{group.status}</span>
                </div>
                <h3 className="schedule-name">{group.name}</h3>
                <p className="schedule-course">{group.teacher ? `${group.teacher} · ${group.students_count} students` : `${group.students_count} students`}</p>
                <div className="schedule-meta">
                  <div className="schedule-row"><CalendarDays size={15} /><span>Days</span><strong>{groupDays(group)}</strong></div>
                  <div className="schedule-row"><Clock size={15} /><span>Starts</span><strong>{times ? formatMinutes(times.start) : group.schedule_time || "Not set"}</strong></div>
                  <div className="schedule-row"><Clock size={15} /><span>Ends</span><strong>{times ? formatMinutes(times.end) : "Not set"}</strong></div>
                  <div className="schedule-row"><DoorOpen size={15} /><span>Room</span><strong>{group.room_name || "Not set"}</strong></div>
                  <div className="schedule-row"><GraduationCap size={15} /><span>Teacher</span><strong>{group.teacher || "Not assigned"}</strong></div>
                  <div className="schedule-row"><Users size={15} /><span>Students</span><strong>{group.students_count}</strong></div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-module"><div className="empty-icon"><CalendarDays size={30} /></div><h1>No groups yet</h1><p className="muted">Create a group to see its lessons on the timetable.</p></div>
      )}
    </>
  );
}
function CreateModal({
  type,
  teachers,
  groups,
  courses,
  rooms,
  close,
  onSaved,
}: {
  type: CreateType;
  teachers: Teacher[];
  groups: Group[];
  courses: Course[];
  rooms: Room[];
  close: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const updateField = (key: string, value: string) => {
    const next = { ...values, [key]: value };
    if (type === "student") {
      if (key === "course") {
        const course = courses.find((item) => item.name === value);
        if (course) next.balance = String(-(course.monthly_fee || 0));
      } else if (key === "group_name") {
        const group = groups.find((item) => item.name === value);
        if (group) {
          const courseName = next.course || group.course;
          if (!next.course && group.course) next.course = group.course;
          if (!next.teacher_name && group.teacher) next.teacher_name = group.teacher;
          const course = courses.find((item) => item.name === courseName);
          if (course) next.balance = String(-(course.monthly_fee || 0));
        }
      }
    }
    setValues(next);
  };
  const config = {
    student: {
      title: "Add student",
      endpoint: "students",
      fields: [
        ["name", "Full name"],
        ["phone", "Phone number"],
        ["parent_name", "Parent name"],
        ["parent_phone", "Parent phone"],
        ["level", "Level"],
        ["course", "Course"],
        ["teacher_name", "Teacher"],
        ["group_name", "Group"],
        ["balance", "Balance (UZS)"],
      ],
    },
    teacher: {
      title: "Add teacher",
      endpoint: "teachers",
      fields: [
        ["name", "Full name"],
        ["subject", "Subject"],
      ],
    },
    group: {
      title: "Add group",
      endpoint: "groups",
      fields: [
        ["name", "Group name"],
        ["course", "Course"],
        ["teacher", "Teacher"],
        ["room_name", "Room"],
        ["schedule_days", "Days"],
        ["schedule_time", "Time"],
      ],
    },
    course: {
      title: "Add course",
      endpoint: "courses",
      fields: [
        ["name", "Course name"],
        ["monthly_fee", "Course price (UZS)"],
      ],
    },
    role: {
      title: "Create role",
      endpoint: "roles",
      fields: [
        ["name", "Role name"],
        ["description", "Description"],
      ],
    },
    user: {
      title: "Create Co-Director account",
      endpoint: "users",
      fields: [
        ["name", "Full name"],
        ["phone", "Phone number"],
        ["password", "Temporary password"],
      ],
    },
    room: {
      title: "Add room",
      endpoint: "rooms",
      fields: [
        ["name", "Room name"],
        ["capacity", "Capacity (seats)"],
        ["location", "Location"],
        ["status", "Status"],
      ],
    },
  }[type];
  const options: Record<string, string[]> = {
    level: [
      "Beginner",
      "Elementary",
      "Pre-Intermediate",
      "Intermediate",
      "Upper-Intermediate",
      "Advanced",
      "IELTS",
    ],
    teacher_name: teachers.map((teacher) => teacher.name),
    teacher: teachers.map((teacher) => teacher.name),
    course: courses.map((course) => course.name),
    group_name: groups.map((group) => group.name),
    room_name: rooms.map((room) => room.name),
    status: ["Active", "Inactive"],
    schedule_days: ["Odd days", "Even days"],
    schedule_time: Array.from({ length: 12 }, (_, index) => {
      const hour = index + 8;
      return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
    }),
  };
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
onSubmit={async (event) => {
          event.preventDefault();
          if (config.endpoint === "groups") {
            const attendanceDays = parseAttendanceDays(values["schedule_days"] ?? "");
            if (attendanceDays.length !== 12) {
              setError(`Select exactly 12 attendance days (odd/even mix) before saving this group.`);
              return;
            }
          }
          const response = await fetch(`/api/${config.endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          if (!response.ok) {
            setError((await response.json()).message ?? "Unable to save");
            return;
          }
          onSaved();
        }}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">BrightPath records</p>
            <h2>{config.title}</h2>
          </div>
          <button type="button" className="more-button" onClick={close}>
            <X size={19} />
          </button>
        </div>
{config.fields.map(([key, label]) => (
          <label key={key}>
            {label}
            {key === "schedule_days" ? (
              <AttendanceDaysPicker value={values[key] ?? ""} onChange={(next) => updateField(key, next)} />
            ) : options[key] ? (
              <select
                required={key === "name"}
                value={values[key] ?? ""}
                onChange={(event) => updateField(key, event.target.value)}
              >
                <option value="" disabled={key === "teacher" && options[key].length === 0}>Choose {label.toLowerCase()}</option>
                {options[key].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                required={key === "name" || key === "monthly_fee"}
                type={key === "balance" || key === "monthly_fee" ? "number" : key === "password" ? "password" : "text"}
                min={key === "monthly_fee" ? 1 : undefined}
                value={values[key] ?? ""}
                onChange={(event) => updateField(key, event.target.value)}
              />
            )}
          </label>
        ))}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function StudentProfile({
  student,
  teachers,
  groups,
  payments,
  close,
  onEdit,
  onDelete,
  onPayment,
  onAddGroup,
  onPrint,
  onDeletePayment,
}: {
  student: Student;
  teachers: Teacher[];
  groups: Group[];
  payments: Payment[];
  close: () => void;
  onEdit: (student: Student) => void;
  onDelete: () => void;
  onPayment: () => void;
  onAddGroup: () => void;
  onPrint: () => void;
  onDeletePayment?: (payment: Payment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [finance, setFinance] = useState<StudentFinance | null>(null);
  const [values, setValues] = useState({
    name: student.name,
    phone: student.phone,
    parent_name: student.parent_name,
    parent_phone: student.parent_phone,
    level: student.level,
    teacher_name: student.teacher_name,
    group_name: student.group_name,
    balance: String(student.balance),
  });
  const save = async () => {
    const response = await fetch(`/api/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.ok) {
      onEdit(await response.json());
      setEditing(false);
    }
  };
  useEffect(() => { fetch(`/api/students/${student.id}/finance`).then((response) => response.ok ? response.json() : null).then(setFinance).catch(() => undefined); }, [student.id, student.group_name, student.teacher_name, student.balance]);
  return (
    <div className="student-profile-page">
      <div className="profile-page-head"><button className="secondary-button" onClick={close}>← Back to students</button><button className="secondary-button" onClick={() => window.print()}><Receipt size={16} /> Print receipt</button></div>
      <div className="modal profile-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Student profile</p>
            <h2>{student.name}</h2>
            <p className="muted">{student.phone || "No phone number"}</p>
          </div>
          <button className="more-button" onClick={close}>
            <X size={19} />
          </button>
        </div>
        {editing ? (
          <div className="profile-form">
            {[
              ["name", "Full name"],
              ["phone", "Phone"],
              ["parent_name", "Parent name"],
              ["parent_phone", "Parent phone"],
              ["level", "Level"],
              ["teacher_name", "Teacher"],
              ["group_name", "Group"],
              ["balance", "Balance"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                {key === "level" ? <select value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="">No level</option>{["Beginner", "Elementary", "Pre-Intermediate", "Intermediate", "Upper-Intermediate", "Advanced", "IELTS"].map((option) => <option key={option}>{option}</option>)}</select> : key === "teacher_name" ? <select value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="">No teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.name}>{teacher.name}</option>)}</select> : key === "group_name" ? <select value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.name}>{group.name}</option>)}</select> : <input value={values[key as keyof typeof values]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />}
              </label>
            ))}
            <button className="primary-button" onClick={save}>
              Save changes
            </button>
          </div>
        ) : (
          <>
            <div className="profile-summary">
              <div>
                <span>Phone</span>
                <strong>{student.phone || "Not set"}</strong>
              </div>
              <div>
                <span>Parent / Guardian</span>
                <strong>{student.parent_name || "Not set"}</strong>
              </div>
              <div>
                <span>Parent phone</span>
                <strong>{student.parent_phone || "Not set"}</strong>
              </div>
              <div>
                <span>Level</span>
                <strong>{student.level || "Not set"}</strong>
              </div>
              <div>
                <span>Teacher</span>
                <strong>{student.teacher_name || "Not assigned"}</strong>
              </div>
              <div>
                <span>Group</span>
                <strong>{student.group_name || "Not assigned"}</strong>
              </div>
              <div>
                <span>Attendance</span>
                <strong>{student.attendance}%</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong className={student.balance < 0 ? "balance-due" : "balance-clear"}>{student.balance < 0 ? `-${money(-student.balance)} UZS` : student.balance > 0 ? `+${money(student.balance)} UZS` : "Paid"}</strong>
              </div>
              <div>
                <span>Required this month</span>
                <strong>{finance ? `${money(finance.required_payment)} UZS` : "Calculating..."}</strong>
              </div>
              <div>
                <span>Paid this month</span>
                <strong>{finance ? `${money(finance.paid_this_month)} UZS` : "Calculating..."}</strong>
              </div>
              <div>
                <span>Outstanding</span>
                <strong className={finance?.outstanding ? "balance-due" : "balance-clear"}>{finance ? `${money(finance.outstanding)} UZS` : "Calculating..."}</strong>
              </div>
              <div>
                <span>Lesson price</span>
                <strong>{finance ? `${money(finance.lesson_price)} UZS` : "Calculating..."}</strong>
              </div>
            </div>
            <div className="profile-actions">
              <button className="primary-button" onClick={onPayment}>
                <CreditCard size={16} /> Add payment
              </button>
              <button
                className="secondary-button"
                onClick={onAddGroup}
              >
                <Users size={16} /> Add to group
              </button>
              <button
                className="secondary-button"
                onClick={onPrint}
              >
                <Receipt size={16} /> Print payment receipt
              </button>
              <button
                className="secondary-button"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button className="danger-button" onClick={onDelete}>
                <Trash2 size={16} /> Delete
              </button>
            </div>
            <section className="profile-payments"><PanelHead title="Payment history" subtitle="Payments recorded for this student" /><PaymentTable payments={payments} onDelete={onDeletePayment} /></section>
          </>
        )}
      </div>
    </div>
  );
}
function ReceiptPrint({ student, payment, operatorName, onDone }: { student: Student; payment?: Payment; operatorName: string; onDone: () => void }) {
  useEffect(() => {
    const finish = () => onDone();
    window.addEventListener("afterprint", finish);
    window.print();
    return () => window.removeEventListener("afterprint", finish);
  }, [onDone]);
  const receiptNumber = payment ? `№${String(payment.id).padStart(7, "0")}` : "№0000000";
  const date = payment?.paid_at || new Date().toLocaleDateString("en-GB");
  const amount = payment ? `${money(payment.amount)} UZS` : "-";
  return <div className="receipt-print-layer"><article className="receipt-paper"><div className="receipt-logo"><span>BP</span></div><div className="receipt-brand">BRIGHTPATH<small>EDUCATION CENTRE</small></div><div className="receipt-number">{receiptNumber}</div><div className="receipt-rule" /><dl><dt>Check number</dt><dd>{receiptNumber}</dd><dt>Company</dt><dd>BrightPath Education Centre</dd><dt>Branch</dt><dd>Main branch</dd><dt>Student</dt><dd>{student.name}</dd><dt>Phone</dt><dd>{student.phone || "-"}</dd><dt>Group</dt><dd>{student.group_name || "-"}</dd><dt>Course price</dt><dd>{amount}</dd><dt>Teacher</dt><dd>{student.teacher_name || "-"}</dd><dt>Type</dt><dd>Tuition payment</dd><dt>Method</dt><dd>{payment?.method || "Cash"}</dd><dt>Payment amount</dt><dd>{amount}</dd><dt>Date</dt><dd>{date}</dd></dl><div className="receipt-footer"><strong>Creator: {operatorName}</strong><span>Cashier: {operatorName}</span><span>Time: {new Date().toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><em>Thank you for choosing BrightPath</em></div></article></div>;
}

function GroupAssignmentModal({ student, groups, close, onSaved }: { student: Student; groups: Group[]; close: () => void; onSaved: (student: Student) => void }) {
  const [groupName, setGroupName] = useState(student.group_name || "");
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const group = groups.find((item) => item.name === groupName); if (!groupName || !group) { setError("Choose a group first"); return; } const response = await fetch(`/api/students/${student.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: student.name, phone: student.phone, level: student.level, teacher_name: group.teacher, group_name: group.name, balance: student.balance }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to assign group"); return; } onSaved(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Group assignment</p><h2>{student.name}</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Choose group<select required value={groupName} onChange={(event) => setGroupName(event.target.value)}><option value="">Select a group</option>{groups.map((group) => <option key={group.id} value={group.name}>{group.name} · {group.teacher || "No teacher"}</option>)}</select></label>{groups.length === 0 && <p className="form-error">Create a group first, then assign this student.</p>}{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit" disabled={!groups.length}>Assign to group</button></div></form></div>;
}
function TeacherEditModal({ teacher, close, onSaved }: { teacher: Teacher; close: () => void; onSaved: (teacher: Teacher) => void }) {
  const [name, setName] = useState(teacher.name);
  const [subject, setSubject] = useState(teacher.subject);
  const [status, setStatus] = useState(teacher.status);
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const response = await fetch(`/api/teachers/${teacher.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, subject, status }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to update teacher"); return; } onSaved(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Teacher records</p><h2>Edit teacher</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Full name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Active</option><option>Inactive</option></select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save changes</button></div></form></div>;
}
function LoginModal({ account, close, onSuccess }: { account: UserAccount; close: () => void; onSuccess: (result: SessionResult) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: account.phone, password }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to sign in"); return; } onSuccess(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Account switching</p><h2>Sign in as {account.name}</h2><p className="muted">{account.phone} · {account.role_name}</p></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Sign in</button></div></form></div>;
}
function LoginScreen({ onLogin }: { onLogin: (result: SessionResult) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password }) }); const result = await response.json(); if (!response.ok) { setError(result.message ?? "Invalid phone number or password"); return; } onLogin(result); } catch { setError("Unable to reach the server"); } finally { setBusy(false); } }}>
        <div className="brand login-brand"><div className="brand-mark">BP</div><div><strong>brightpath</strong><small>education centre</small></div></div>
        <p className="eyebrow">Please log in</p>
        <h1 className="login-title">Welcome back</h1>
        <p className="muted">Sign in with your staff phone number and password to continue.</p>
        <label>Phone or email<input required value={phone} onChange={(event) => setPhone(event.target.value)} autoFocus /></label>
        <label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
function GroupEditModal({ group, teachers, rooms, close, onSaved }: { group: Group; teachers: Teacher[]; rooms: Room[]; close: () => void; onSaved: (group: Group) => void }) {
  const [values, setValues] = useState({ name: group.name, course: group.course, teacher: group.teacher, room_name: group.room_name, schedule_days: initAttendanceDays(group.schedule_days), schedule_time: group.schedule_time });
  const [error, setError] = useState("");
  const times = Array.from({ length: 12 }, (_, index) => { const hour = index + 8; return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`; });
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const attendanceDays = parseAttendanceDays(values.schedule_days); if (attendanceDays.length > 0 && attendanceDays.length !== 12) { setError("Attendance days must be exactly 12 (odd/even mix)."); return; } 

const response = await fetch(`/api/groups/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to update group"); return; } onSaved(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Group records</p><h2>Edit group</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Group name<input required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label><label>Course<input value={values.course} onChange={(event) => setValues({ ...values, course: event.target.value })} /></label><label>Teacher<select value={values.teacher} onChange={(event) => setValues({ ...values, teacher: event.target.value })}><option value="">No teacher</option>{teachers.map((teacher) => <option key={teacher.id}>{teacher.name}</option>)}</select></label><label>Room<select value={values.room_name} onChange={(event) => setValues({ ...values, room_name: event.target.value })}><option value="">No room</option>{rooms.map((room) => <option key={room.id} value={room.name}>{room.name} {room.capacity ? `· ${room.capacity} seats` : ""}</option>)}</select></label><label>Days<AttendanceDaysPicker value={values.schedule_days} onChange={(next) => setValues({ ...values, schedule_days: next })} /></label><label>Time<select value={values.schedule_time} onChange={(event) => setValues({ ...values, schedule_time: event.target.value })}><option value="">Not set</option>{times.map((time) => <option key={time}>{time}</option>)}</select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save changes</button></div></form></div>;
}
function CourseEditModal({ course, close, onSaved }: { course: Course; close: () => void; onSaved: (course: Course) => void }) {
  const [values, setValues] = useState({ name: course.name, level: course.level, monthly_fee: String(course.monthly_fee || 0) });
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const response = await fetch(`/api/courses/${course.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, monthly_fee: Number(values.monthly_fee) || 0 }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to update course"); return; } onSaved(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Course records</p><h2>Edit course</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Course name<input required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label><label>Level<input value={values.level} onChange={(event) => setValues({ ...values, level: event.target.value })} /></label><label>Course price (UZS)<input required type="number" min={1} value={values.monthly_fee} onChange={(event) => setValues({ ...values, monthly_fee: event.target.value })} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save changes</button></div></form></div>;
}
function PaymentModal({
  student,
  payment,
  students,
  close,
  onSaved,
}: {
  student?: Student;
  payment?: Payment;
  students?: Student[];
  close: () => void;
  onSaved: (result: { student_id?: number; delta: number }) => void;
}) {
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const [method, setMethod] = useState(payment?.method ?? "Cash");
  const [selectedId, setSelectedId] = useState<number>(student?.id ?? payment?.student_id ?? students?.[0]?.id ?? 0);
  const isEditing = Boolean(payment);
  const selectedStudent = students?.find((item) => item.id === selectedId);
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!student && !payment && !selectedStudent) return;
          const response = await fetch(payment ? `/api/payments/${payment.id}` : "/api/payments", {
            method: payment ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(selectedStudent ? { student_id: selectedStudent.id, student_name: selectedStudent.name } : student ? { student_id: student.id, student_name: student.name } : {}),
              amount,
              method,
            }),
          });
          if (response.ok) onSaved({ student_id: selectedStudent?.id ?? student?.id ?? payment?.student_id, delta: payment ? payment.amount - Number(amount) : Number(amount) });
        }}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">{isEditing ? "Edit payment" : "Payment"}</p>
            <h2>{student?.name ?? payment?.student_name ?? "Record payment"}</h2>
          </div>
          <button type="button" className="more-button" onClick={close}>
            <X size={19} />
          </button>
        </div>
        {students && !student && !payment && (
          <label>
            Student
            <select required value={selectedId} onChange={(event) => setSelectedId(Number(event.target.value))}>
              <option value={0} disabled>Choose a student</option>
              {students.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.group_name || "No group"}</option>)}
            </select>
          </label>
        )}
        <label>
          Amount (UZS)
          <input
            required
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label>
          Payment method
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            {["Cash", "Card", "Click", "Payme", "Uzum", "Transfer"].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            {isEditing ? "Save changes" : "Save payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
function ReceiptsPage({ payments, onPrint }: { payments: Payment[]; onPrint: (payment: Payment) => void }) {
  const now = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(now);
  const months = Array.from(new Set(payments.map((p) => (p.paid_at || "").slice(0, 7)))).sort().reverse();
  const filtered = payments.filter((p) => (p.paid_at || "").startsWith(month));
  const total = filtered.reduce((sum, p) => sum + p.amount, 0);
  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Receipts"
        subtitle="Browse issued receipts and reprint any document for parents."
        action={
          <div className="filter-row">
            <select className="attendance-select" value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.length ? months.map((m) => <option key={m} value={m}>{m}</option>) : <option value={now}>{now}</option>}
            </select>
          </div>
        }
      />
      <div className="stat-grid">
        <Stat label="Receipts this month" value={String(filtered.length)} icon={<Receipt />} color="teal" />
        <Stat label="Total issued" value={`${money(total)} UZS`} icon={<WalletCards />} color="orange" />
      </div>
      <section className="panel table-panel page-panel">
        <PanelHead title={`Receipts (${filtered.length})`} subtitle="Click print to re-issue a receipt" />
        <PaymentTable payments={filtered} onPrint={onPrint} />
      </section>
    </>
  );
}

function ReportsPage({ reports, onAdd, onToggleRead, onDelete }: { reports: Report[]; onAdd: () => void; onToggleRead: (report: Report) => void; onDelete: (report: Report) => void }) {
  const unread = reports.filter((report) => !report.is_read).length;
  return (
    <>
      <PageHeading
        eyebrow="Communications"
        title="Reports"
        subtitle="Teacher and staff reports — attendance issues, incidents and notices."
        action={<button className="primary-button" onClick={onAdd}><Plus size={17} /> New report</button>}
      />
      <div className="report-list">
        {reports.length ? reports.map((report) => (
          <article key={report.id} className={`report-card ${report.is_read ? "read" : ""}`}>
            <div className="report-card-top">
              <span className={`status-pill ${report.priority === "high" ? "balance-due" : "paid"}`}>{report.priority || "normal"}</span>
              {!report.is_read && <b className="nav-badge">new</b>}
              <span className="muted">{report.created_at?.slice(0, 10)} · {report.author}</span>
            </div>
            <h3>{report.title}</h3>
            {report.message && <p className="muted">{report.message}</p>}
            <div className="row-actions">
              <button className="secondary-button table-action" onClick={() => onToggleRead(report)}>{report.is_read ? "Mark unread" : "Mark read"}</button>
              <button className="danger-button table-action" onClick={() => onDelete(report)}><Trash2 size={14} /> Delete</button>
            </div>
          </article>
        )) : <div className="empty-module"><p className="muted">No reports yet. Create the first one.</p></div>}
      </div>
      {unread > 0 && <p className="muted">{unread} unread report{unread === 1 ? "" : "s"}</p>}
    </>
  );
}

function DebtsPage({ debts, students, onOpenStudent, onNotify }: { debts: DebtItem[]; students: Student[]; onOpenStudent: (student: Student) => void; onNotify: (debt: DebtItem) => void }) {
  const total = debts.reduce((sum, debt) => sum + debt.total, 0);
  const findStudent = (debt: DebtItem) => students.find((student) => student.id === debt.student_id);
  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Debt collection"
        subtitle="Outstanding balances with ageing — chase late payments before they grow."
        action={<p className="panel-total">Total owed: <strong>{money(total)} UZS</strong></p>}
      />
      <section className="panel table-panel page-panel">
        <PanelHead title={`Ledger (${debts.length} students)`} subtitle="Click a student to open their profile" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Group</th>
                <th>Current</th>
                <th>30 days</th>
                <th>60 days</th>
                <th>90+ days</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {debts.length ? debts.map((debt) => (
                <tr key={debt.student_id}>
                  <td><div className="table-person"><div className="avatar small">{debt.student_name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div><div><strong>{debt.student_name}</strong><small>{debt.parent_name || "No parent on file"}</small></div></div></td>
                  <td>{debt.group_name || "Not assigned"}</td>
                  <td className={debt.current ? "balance-due" : "balance-clear"}>{debt.current ? `${money(debt.current)} UZS` : "—"}</td>
                  <td className={debt.overdue30 ? "balance-due" : "balance-clear"}>{debt.overdue30 ? `${money(debt.overdue30)} UZS` : "—"}</td>
                  <td className={debt.overdue60 ? "balance-due" : "balance-clear"}>{debt.overdue60 ? `${money(debt.overdue60)} UZS` : "—"}</td>
                  <td className={debt.overdue90 ? "balance-due" : "balance-clear"}>{debt.overdue90 ? `${money(debt.overdue90)} UZS` : "—"}</td>
                  <td className="balance-due"><strong>{money(debt.total)} UZS</strong></td>
                  <td className="row-actions">
                    <button className="secondary-button table-action" onClick={() => { const target = findStudent(debt); if (target) onOpenStudent(target); }}>Open</button>
                    <button className="secondary-button table-action" onClick={() => onNotify(debt)} disabled={!debt.parent_phone} title={debt.parent_phone ? "Send SMS reminder to parent" : "No parent phone"}>
                      <Send size={13} /> Remind
                    </button>
                  </td>
                </tr>
              )) : <tr><td colSpan={8}>No outstanding debts. Great!</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function InvoicesPage({ month, setMonth, invoices, busy, onGenerate, onMarkPaid, onDelete, onExport }: { month: string; setMonth: (m: string) => void; invoices: Invoice[]; busy: boolean; onGenerate: () => void; onMarkPaid: (invoice: Invoice) => void; onDelete: (invoice: Invoice) => void; onExport: () => void }) {
  const unpaidTotal = invoices.filter((invoice) => invoice.status === "unpaid").reduce((sum, invoice) => sum + invoice.amount, 0);
  const paidTotal = invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.amount, 0);
  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Invoices"
        subtitle="Automatically generate monthly invoices from lessons attended."
        action={
          <div className="heading-actions">
            <button className="secondary-button" onClick={onExport}>
              <Download size={15} /> Export CSV
            </button>
            <button className="primary-button" onClick={onGenerate} disabled={busy}>
              <FileText size={16} /> {busy ? "Generating…" : "Generate for month"}
            </button>
          </div>
        }
      />
      <div className="stat-grid">
        <Stat label="Invoices this month" value={String(invoices.length)} icon={<FileText />} color="teal" />
        <Stat label="Unpaid" value={`${money(unpaidTotal)} UZS`} icon={<AlertTriangle />} color="red" />
        <Stat label="Collected" value={`${money(paidTotal)} UZS`} icon={<WalletCards />} color="blue" />
      </div>
      <section className="panel table-panel page-panel">
        <div className="panel-head">
          <div>
            <h2>Month</h2>
            <p className="muted">Filter invoices by billing period</p>
          </div>
          <input className="attendance-date" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Amount</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length ? invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.student_name}</strong></td>
                  <td>{money(invoice.amount)} UZS</td>
                  <td>{invoice.issue_date}</td>
                  <td>{invoice.due_date}</td>
                  <td>{invoice.status === "paid" ? <span className="status-pill paid"><Check size={12} /> {invoice.status}</span> : <span className="status-pill balance-due">{invoice.status}</span>}</td>
                  <td className="row-actions">
                    <button className="secondary-button table-action" onClick={() => onMarkPaid(invoice)}>{invoice.status === "paid" ? "Mark unpaid" : "Mark paid"}</button>
                    <button className="danger-button table-action" onClick={() => onDelete(invoice)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              )) : <tr><td colSpan={6}>No invoices for this month. Generate them to bill students automatically.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ExamsPage({ exams, onAdd, onDelete }: { exams: Exam[]; onAdd: () => void; onDelete: (exam: Exam) => void }) {
  const levels = Array.from(new Set(exams.map((exam) => exam.level || "General"))).filter(Boolean);
  return (
    <>
      <PageHeading
        eyebrow="Learning"
        title="Exams & results"
        subtitle="Track placement tests, unit tests and mock scores — spot trending students."
        action={<button className="primary-button" onClick={onAdd}><Plus size={17} /> Record exam</button>}
      />
      {levels.length > 0 && (
        <section className="panel page-panel"><PanelHead title="Level performance" subtitle="Average score by level" />
          <div className="permission-summary">
            {levels.map((level) => {
              const group = exams.filter((exam) => (exam.level || "General") === level);
              const avg = group.reduce((sum, exam) => sum + (exam.score / Math.max(exam.max_score, 1)) * 100, 0) / Math.max(group.length, 1);
              return <div key={level}><strong>{level}</strong><small>{Math.round(avg)}% average · {group.length} test{group.length === 1 ? "" : "s"}</small></div>;
            })}
          </div>
        </section>
      )}
      <section className="panel table-panel page-panel">
        <PanelHead title={`Results (${exams.length})`} subtitle="Most recent exams first" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Exam</th>
                <th>Score</th>
                <th>Level</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exams.length ? exams.map((exam) => (
                <tr key={exam.id}>
                  <td><strong>{exam.student_name}</strong></td>
                  <td>{exam.exam_type}</td>
                  <td>{Math.round((exam.score / Math.max(exam.max_score, 1)) * 100)}% <span className="muted">({exam.score}/{exam.max_score})</span></td>
                  <td>{exam.level || "Not set"}</td>
                  <td>{exam.taken_at}</td>
                  <td className="row-actions"><button className="danger-button table-action" title="Delete" onClick={() => onDelete(exam)}><Trash2 size={14} /></button></td>
                </tr>
              )) : <tr><td colSpan={6}>No exam results yet. Record a placement test to start tracking progress.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RoomsPage({ rooms, groups, onAdd, onEdit, onDelete }: { rooms: Room[]; groups: Group[]; onAdd: () => void; onEdit: (room: Room) => void; onDelete: (room: Room) => void }) {
  const totalSeats = rooms.reduce((sum, room) => sum + room.capacity, 0);
  return (
    <>
      <PageHeading
        eyebrow="Operations"
        title="Classrooms"
        subtitle="Manage rooms, capacities and where each group is based."
        action={<button className="primary-button" onClick={onAdd}><Plus size={17} /> Add room</button>}
      />
      <div className="stat-grid">
        <Stat label="Classrooms" value={String(rooms.length)} icon={<Building2 />} color="teal" />
        <Stat label="Total capacity" value={String(totalSeats)} icon={<DoorOpen />} color="orange" />
        <Stat label="Groups placed" value={String(groups.filter((g) => g.room_name).length)} icon={<Users />} color="blue" />
      </div>
      <div className="schedule-grid">
        {rooms.length ? rooms.map((room) => (
          <article key={room.id} className="schedule-card">
            <div className="schedule-card-top">
              <span className="schedule-kind">{room.name}</span>
              <span className={`status-pill ${room.status === "Active" ? "paid" : "balance-due"}`}>{room.status}</span>
            </div>
            <p className="schedule-course"><Building2 size={13} /> {room.location || "No location set"} · {room.capacity} seats</p>
            <div className="schedule-meta">
              {room.groups?.length ? room.groups.map((group) => (
                <div className="schedule-row" key={group.name}><DoorOpen size={15} /><span>Group</span><strong>{group.name} · {group.students_count}/{room.capacity}</strong></div>
              )) : <div className="schedule-row"><DoorOpen size={15} /><span>Group</span><strong>No group assigned</strong></div>}
            </div>
            <div className="row-actions">
              <button className="secondary-button table-action" onClick={() => onEdit(room)}><Pencil size={13} /> Edit</button>
              <button className="danger-button table-action" title="Delete room" onClick={() => onDelete(room)}><Trash2 size={14} /></button>
            </div>
          </article>
        )) : <div className="empty-module"><p className="muted">No rooms yet. Add one to start assigning groups.</p></div>}
      </div>
    </>
  );
}

function MessagesPage({ messages, onSend, onDelete }: { messages: MessageItem[]; onSend: () => void; onDelete: (message: MessageItem) => void }) {
  const channels = { SMS: "teal", Telegram: "orange", WhatsApp: "blue" } as Record<string, string>;
  return (
    <>
      <PageHeading
        eyebrow="Communications"
        title="Messages"
        subtitle="SMS, Telegram and WhatsApp notices sent to parents and students."
        action={<button className="primary-button" onClick={onSend}><Send size={16} /> Compose message</button>}
      />
      <section className="panel page-panel">
        <PanelHead title="Outbox" subtitle={`${messages.length} sent messages`} />
        <div className="feed">
          {messages.length ? messages.map((message) => (
            <article key={message.id} className="feed-item">
              <div className={`stat-icon small ${channels[message.channel] ?? "teal"}`}><Send size={13} /></div>
              <div className="feed-body">
                <div className="feed-top">
                  <strong>{message.recipient}</strong>
                  <span className="status-pill paid">{message.channel}</span>
                  <span className="muted">{message.created_at?.replace("T", " ").slice(0, 16)}</span>
                </div>
                {message.subject && <p className="feed-subject">{message.subject}</p>}
                <p className="muted">{message.body}</p>
              </div>
              <button className="danger-button table-action" onClick={() => onDelete(message)}><Trash2 size={13} /></button>
            </article>
          )) : <p className="muted">No messages yet.</p>}
        </div>
      </section>
    </>
  );
}

function ActivityPage({ activity }: { activity: ActivityItem[] }) {
  return (
    <>
      <PageHeading
        eyebrow="System"
        title="Activity log"
        subtitle="Every important action across the centre — who did what and when."
        action={<ShieldCheck size={20} />}
      />
      <section className="panel page-panel">
        <div className="feed">
          {activity.length ? activity.map((item) => (
            <article key={item.id} className="feed-item">
              <div className="avatar small">{item.user_name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>
              <div className="feed-body">
                <div className="feed-top">
                  <strong>{item.user_name}</strong>
                  <span className="muted">{item.created_at?.replace("T", " ").slice(0, 16)}</span>
                </div>
                <p className="muted">{item.action} — {item.target}</p>
              </div>
            </article>
          )) : <p className="muted">No activity recorded yet.</p>}
        </div>
      </section>
    </>
  );
}

function StaffPage({ users, currentUser, roles, onCreate, onEdit, onEditPermissions, onDelete }: { users: UserAccount[]; currentUser: UserAccount | null; roles: StaffRole[]; onCreate: () => void; onEdit: (user: UserAccount) => void; onEditPermissions: (role: StaffRole) => void; onDelete: (user: UserAccount) => void }) {
  if (currentUser?.role_name !== "Super Admin") {
    return (
      <>
        <PageHeading eyebrow="Administration" title="Staff & access" subtitle="Manage the team — sign ins, roles and passwords." action={<span className="status-pill paid">Read only</span>} />
        <section className="panel page-panel">
          <div className="empty-module">
            <div className="empty-icon"><ShieldCheck size={30} /></div>
            <h1>Managed by the Main Director</h1>
            <p className="muted">Only the Main Director can add, edit or remove staff accounts, and assign roles and passwords.</p>
          </div>
        </section>
      </>
    );
  }
  const totalRoles = roles.length || new Set(users.map((user) => user.role_name)).size;
  return (
    <>
      <PageHeading
        eyebrow="Administration"
        title="Staff & access"
        subtitle="Manage your team — staff log in with their phone number and the password you set."
        action={<button className="primary-button" onClick={onCreate}><Plus size={17} /> Add staff</button>}
      />
      <div className="stat-grid">
        <Stat
          label="Staff members"
          value={String(users.length)}
          icon={<Users />}
          color="teal"
        />
        <Stat
          label="Roles"
          value={String(totalRoles)}
          icon={<ShieldCheck />}
          color="orange"
        />
        <Stat
          label="Super Admins"
          value={String(users.filter((user) => user.role_name === "Super Admin").length)}
          icon={<ShieldCheck />}
          color="red"
        />
        <Stat
          label="Login method"
          value="Phone number"
          icon={<UserRound />}
          color="blue"
        />
      </div>
      <section className="panel table-panel page-panel">
        <PanelHead title={`Staff accounts (${users.length})`} subtitle="Sign in with the phone number shown here · Only the Main Director can manage staff" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Phone (login)</th>
                <th>Role</th>
                <th>Account type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length ? users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong>{user.id === currentUser?.id && <span className="status-pill paid">You</span>}</td>
                  <td>{user.phone || "No phone set"}</td>
                  <td>{user.role_name || "No role"}</td>
                  <td>{(user.role_name === "Super Admin" || roles.some((role) => role.id === user.role_id && role.is_system === 1)) ? "System account" : "Created by director"}</td>
                  <td className="row-actions">
                    <button className="secondary-button table-action" title="Edit" onClick={() => onEdit(user)}><Pencil size={13} /></button>
                    <button className="danger-button table-action" title="Delete" onClick={() => onDelete(user)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="muted">No staff accounts yet — add your first team member.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel table-panel page-panel">
        <PanelHead title="Role permissions" subtitle="What each role is allowed to do across the app — only the Main Director can change this" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length ? roles.map((role) => (
                <tr key={role.id}>
                  <td><strong>{role.name}</strong>{role.is_system === 1 && <span className="status-pill paid">System</span>}</td>
                  <td>{role.description || "—"}</td>
                  <td>{role.name === "Super Admin" ? "Full access to everything" : `${(role.permissions ?? []).length} permissions granted`}</td>
                  <td className="row-actions">
                    {role.name === "Super Admin"
                      ? <button className="secondary-button table-action" title="Super Admin has full access" onClick={() => window.alert("Main Director / Super Admin always has full access to everything.")}><ShieldCheck size={13} /></button>
                      : <button className="secondary-button table-action" title="Edit permissions" onClick={() => onEditPermissions(role)}><Pencil size={13} /> Permissions</button>}
                  </td>
                </tr>
              )) : <tr><td colSpan={4} className="muted">No roles found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RolePermissionsModal({ role, allPerms, close, onSaved }: { role: StaffRole; allPerms: PermissionItem[]; close: () => void; onSaved: (role: StaffRole) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions ?? []));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const modules = [...new Set(allPerms.map((permission) => permission.module))];
  const actions = ["view", "create", "edit", "delete"];
  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch(`/api/roles/${role.id}/permissions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: [...selected] }) });
          const result = await response.json();
          if (!response.ok) { setError(result.message ?? "Unable to save permissions"); return; }
          onSaved(result);
        } catch { setError("Unable to reach the server"); }
        finally { setBusy(false); }
      }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>Permissions · {role.name}</h2>
            <p className="muted">Tick what this role is allowed to do. Untick to remove access.</p>
          </div>
          <button type="button" className="more-button" onClick={close}><X size={19} /></button>
        </div>
        <div className="modal-permissions">
          <strong>What this role can do</strong>
          {modules.map((module) => (
            <div className="permission-row" key={module}>
              <span>{titleCase(module)}</span>
              {actions.map((action) => {
                const key = `${module}:${action}`;
                return (
                  <label key={key}>
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                    {titleCase(action)}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <p className="muted">Selected: {selected.size} permission{selected.size === 1 ? "" : "s"}</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save permissions"}</button>
        </div>
      </form>
    </div>
  );
}

function StaffModal({ mode, user, roles, close, onSaved }: { mode: "create" | "edit"; user?: UserAccount; roles: StaffRole[]; close: () => void; onSaved: (user: UserAccount) => void }) {
  const [values, setValues] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", role_name: user?.role_name ?? "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isEdit = mode === "edit";
  const roleNames = roles.length ? roles.map((role) => role.name) : [];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = values.name.trim();
    const phone = values.phone.trim();
    if (!name || !phone) { setError("Name and phone number are required"); return; }
    if (!values.role_name) { setError("Choose a role for this staff member"); return; }
    if (!isEdit && values.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (values.password && values.password !== values.confirm) { setError("Passwords do not match"); return; }
    if (!isEdit && !values.password) { setError("Set an initial password so they can sign in"); return; }
    setBusy(true);
    setError("");
    try {
      const payload = { name, phone, role_name: values.role_name, password: values.password };
      const response = await fetch(isEdit ? `/api/users/${user!.id}` : "/api/users", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "Unable to save staff account"); return; }
      onSaved(result);
    } catch { setError("Unable to reach the server"); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>{isEdit ? `Edit ${user?.name ?? "staff"}` : "Add staff member"}</h2>
            <p className="muted">They will sign in with their phone number.</p>
          </div>
          <button type="button" className="more-button" onClick={close}><X size={19} /></button>
        </div>
        <label>Full name<input required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label>
        <label>Phone number (login)<input required type="tel" value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} placeholder="+998 90 000 00 00" /></label>
        <label>Role<select required value={values.role_name} onChange={(event) => setValues({ ...values, role_name: event.target.value })}><option value="" disabled>Choose a role</option>{roleNames.map((role) => <option key={role}>{role}</option>)}</select></label>
        <label>{isEdit ? "New password (leave blank to keep current)" : "Password"}<input type="password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} autoComplete="new-password" /></label>
        {values.password ? <label>Confirm password<input type="password" value={values.confirm} onChange={(event) => setValues({ ...values, confirm: event.target.value })} autoComplete="new-password" /></label> : null}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={close}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Add staff"}</button>
        </div>
      </form>
    </div>
  );
}

function SystemPage({ onBackup, onRestore, onReset }: { onBackup: () => Promise<void>; onRestore: (backup: BackupItem) => Promise<void>; onReset: () => Promise<void> }) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const refresh = async () => {
    const response = await fetch("/api/system/backups");
    if (response.ok) setBackups(await response.json());
  };
  useEffect(() => { void refresh(); }, []);
  const downloadBackup = async (name: string) => {
    const response = await fetch(`/api/system/backup/file/${encodeURIComponent(name)}`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const fmtBytes = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${(value / 1e3).toFixed(1)} KB`;
  return (
    <>
      <PageHeading
        eyebrow="System"
        title="System & backups"
        subtitle="Protect your data — create snapshots, restore or reset the demo."
        action={
          <button className="primary-button" onClick={async () => { await onBackup(); void refresh(); }}>
            <Download size={16} /> Create backup
          </button>
        }
      />
      <div className="dashboard-grid">
        <section className="panel page-panel">
          <PanelHead title="Backup snapshots" subtitle="Live SQLite backups stored on the server" />
          <div className="feed">
            {backups.length ? backups.map((backup) => (
              <article key={backup.name} className="feed-item">
                <div className="stat-icon small teal"><History size={13} /></div>
                <div className="feed-body">
                  <strong>{backup.name}</strong>
                  <p className="muted">{fmtBytes(backup.size)} · {backup.time.replace("T", " ").slice(0, 19)}</p>
                </div>
                <div className="row-actions">
                  <button className="secondary-button table-action" onClick={() => void downloadBackup(backup.name)}><Download size={13} /> Download</button>
                  <button className="secondary-button table-action" onClick={() => void onRestore(backup)}><RotateCcw size={13} /> Restore</button>
                </div>
              </article>
            )) : <p className="muted">No backups yet — create your first snapshot.</p>}
          </div>
        </section>
        <section className="panel page-panel">
          <PanelHead title="Danger zone" subtitle="Destructive actions for the demo setup" />
          <div className="danger-zone">
            <p className="muted">Return the database to its original demo seed. This deletes all of your work and cannot be undone.</p>
            <button className="danger-button" onClick={() => void onReset()}><RotateCcw size={15} /> Reset to demo data</button>
          </div>
        </section>
      </div>
    </>
  );
}

function ExamModal({ students, close, onSaved }: { students: Student[]; close: () => void; onSaved: (exam?: Exam) => void }) {
  const [values, setValues] = useState({ student_id: students[0]?.id ?? 0, exam_type: "Placement Test", score: "", max_score: "100", level: "Beginner", taken_at: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const response = await fetch("/api/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, score: Number(values.score) || 0, max_score: Number(values.max_score) || 100 }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to save exam"); return; } onSaved(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Learning</p><h2>Record exam result</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Student<select required value={values.student_id} onChange={(event) => setValues({ ...values, student_id: Number(event.target.value) })}><option value={0} disabled>Choose a student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.group_name || "No group"}</option>)}</select></label><label>Exam type<select value={values.exam_type} onChange={(event) => setValues({ ...values, exam_type: event.target.value })}><option>Placement Test</option><option>Unit Test</option><option>Mock IELTS</option><option>Mock Speaking</option><option>Mock Writing</option><option>Final Exam</option></select></label><label>Score<input required type="number" min={0} value={values.score} onChange={(event) => setValues({ ...values, score: event.target.value })} /></label><label>Max score<input required type="number" min={1} value={values.max_score} onChange={(event) => setValues({ ...values, max_score: event.target.value })} /></label><label>Level<select value={values.level} onChange={(event) => setValues({ ...values, level: event.target.value })}>{["Beginner", "Elementary", "Pre-Intermediate", "Intermediate", "Upper-Intermediate", "Advanced", "IELTS"].map((level) => <option key={level}>{level}</option>)}</select></label><label>Date<input required type="date" value={values.taken_at} onChange={(event) => setValues({ ...values, taken_at: event.target.value })} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save result</button></div></form></div>;
}

function ReportModal({ currentUser, close, onSaved }: { currentUser: UserAccount | null; close: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({ title: "", message: "", priority: "normal" });
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, author: currentUser?.name ?? "Staff" }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to save report"); return; } onSaved(); }}><div className="modal-head"><div><p className="eyebrow">Communications</p><h2>New report</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Title<input required value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label><label>Details<textarea rows={4} value={values.message} onChange={(event) => setValues({ ...values, message: event.target.value })} /></label><label>Priority<select value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })}><option>normal</option><option>high</option><option>urgent</option></select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save report</button></div></form></div>;
}

function SendMessageModal({ students, close, onSaved }: { students: Student[]; close: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({ student_id: students[0]?.id ?? 0, channel: "SMS", subject: "", body: "" });
  const [error, setError] = useState("");
  const selected = students.find((student) => student.id === values.student_id);
  const recipient = selected ? (selected.parent_name || selected.name) : "";
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); if (!recipient) { setError("Choose a student with a parent on file"); return; } const response = await fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, recipient, subject: values.subject || "BrightPath notice" }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to send"); return; } onSaved(); }}><div className="modal-head"><div><p className="eyebrow">Communications</p><h2>Compose message</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Student<select required value={values.student_id} onChange={(event) => setValues({ ...values, student_id: Number(event.target.value) })}><option value={0} disabled>Choose a student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.parent_name ? `parent: ${student.parent_name}` : "no parent on file"}</option>)}</select></label><label>Channel<select value={values.channel} onChange={(event) => setValues({ ...values, channel: event.target.value })}><option>SMS</option><option>Telegram</option><option>WhatsApp</option></select></label><label>Subject<input value={values.subject} placeholder="BrightPath notice" onChange={(event) => setValues({ ...values, subject: event.target.value })} /></label><label>Message<textarea required rows={4} value={values.body} onChange={(event) => setValues({ ...values, body: event.target.value })} /></label>{recipient ? <p className="muted">Sending to {recipient}{selected?.parent_phone ? ` · ${selected.parent_phone}` : ""}</p> : null}{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit"><Send size={15} /> Send</button></div></form></div>;
}

function RoomEditModal({ room, close, onSaved }: { room: Room; close: () => void; onSaved: (room: Room) => void }) {
  const [values, setValues] = useState({ name: room.name, capacity: String(room.capacity || 0), location: room.location, status: room.status });
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="modal" onSubmit={async (event) => { event.preventDefault(); const response = await fetch(`/api/rooms/${room.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, capacity: Number(values.capacity) || 0 }) }); if (!response.ok) { setError((await response.json()).message ?? "Unable to update room"); return; } onSaved(await response.json()); }}><div className="modal-head"><div><p className="eyebrow">Operations</p><h2>Edit room</h2></div><button type="button" className="more-button" onClick={close}><X size={19} /></button></div><label>Room name<input required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label><label>Capacity (seats)<input required type="number" min={1} value={values.capacity} onChange={(event) => setValues({ ...values, capacity: event.target.value })} /></label><label>Location<input value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></label><label>Status<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}><option>Active</option><option>Inactive</option></select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save changes</button></div></form></div>;
}

export default App;

