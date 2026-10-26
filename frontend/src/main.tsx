import React, { useEffect, useState, createContext, useContext, FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  Link,
} from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ReceiptText,
  FileBarChart,
  Settings,
  LogOut,
  Dumbbell,
  Menu,
  X,
  Plus,
  ArrowUpRight,
  Wallet,
  CalendarDays,
  UserCheck,
  Clock,
  Search,
  Upload,
  CheckCircle2,
  ChevronRight,
  Printer,
  ShieldCheck,
  Activity,
  Eye,
  Check,
  AlertCircle,
  History,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { api, send, money, today, dateLabel, statusLabel } from './api';
import './style.css';
type User = { id: string; name: string; username: string; role: string };
type Category = {
  id: string;
  code: string;
  name: string;
  priceSatang: number;
  durationDays: number;
  active: boolean;
};
const Context = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  notify: (s: string, error?: boolean) => void;
  categories: Category[];
  reloadCategories: () => Promise<void>;
}>({} as any);
const useApp = () => useContext(Context);
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<any>, { 'aria-label': label })
        : children}
    </label>
  );
}
function Empty({ text = 'ยังไม่มีข้อมูลในช่วงเวลานี้' }: { text?: string }) {
  return (
    <div className="empty">
      <ClipboardList size={30} />
      <strong>{text}</strong>
      <span>เมื่อบันทึกรายการ ข้อมูลจะแสดงที่นี่</span>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return <span className={'badge ' + status.toLowerCase()}>{statusLabel[status] || status}</span>;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement;
    const el = document.querySelector<HTMLButtonElement>('.modal-close');
    el?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,a[href]',
          );
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button modal-close" onClick={onClose} aria-label="ปิด">
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function useLoad<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api<T>(url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [url, ...deps]);
  return { data, loading, error, load };
}
function LoadState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: React.ReactNode;
}) {
  return loading ? (
    <div role="status" className="loading">
      <span className="spinner" />
      กำลังโหลดข้อมูล…
    </div>
  ) : error ? (
    <div role="alert" className="error-box">
      <AlertCircle />
      {error}
      <button onClick={() => location.reload()}>ลองใหม่</button>
    </div>
  ) : (
    <>{children}</>
  );
}
function CategorySelect({
  value,
  onChange,
  all = false,
  'aria-label': label,
}: {
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
  'aria-label'?: string;
}) {
  const { categories } = useApp();
  return (
    <select
      aria-label={label}
      required={!all}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{all ? 'ทุกประเภท' : 'เลือกประเภทบริการ'}</option>
      {categories
        .filter((c) => c.active)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · ฿{money(c.priceSatang)}
          </option>
        ))}
    </select>
  );
}
function PageTitle({
  eyebrow = 'ระบบบริหารจัดการ',
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [toast, setToast] = useState<{ s: string; error: boolean } | null>(null);
  const refresh = async () => {
    const d = await api('/auth/me');
    setUser(d.user);
    setCategories(await api('/categories'));
  };
  const reloadCategories = async () => setCategories(await api('/categories'));
  useEffect(() => {
    refresh()
      .then(() => setReady(true))
      .catch((e) => setBootError(e.message));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  return (
    <Context.Provider
      value={{
        user,
        refresh,
        notify: (s, error = false) => setToast({ s, error }),
        categories,
        reloadCategories,
      }}
    >
      {bootError ? (
        <div className="error-box">
          {bootError}
          <button onClick={() => location.reload()}>ลองใหม่</button>
        </div>
      ) : !ready ? (
        <div className="loading">กำลังเชื่อมต่อ WU Fitness…</div>
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/submit-payment"
              element={
                <PublicShell>
                  <SubmitPayment />
                </PublicShell>
              }
            />
            <Route
              path="/payment-status"
              element={
                <PublicShell>
                  <PaymentStatus />
                </PublicShell>
              }
            />
            <Route
              path="/*"
              element={
                user && ['ADMIN', 'STAFF'].includes(user.role) ? (
                  <Shell />
                ) : (
                  <Navigate to={user ? '/submit-payment' : '/login'} replace />
                )
              }
            />
          </Routes>
        </BrowserRouter>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={'toast ' + (toast.error ? 'bad' : '')}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.s}</span>
          <button onClick={() => setToast(null)} aria-label="ปิดข้อความ">
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="brand-icon">
        <Dumbbell size={25} />
      </div>
      <div>
        <strong>
          WU <span>FITNESS</span>
        </strong>
        <small>WALAILAK UNIVERSITY</small>
      </div>
    </div>
  );
}
function PublicShell({ children }: { children: React.ReactNode }) {
  const { user, refresh, notify } = useApp();
  return (
    <div className="public">
      <header>
        <Link to="/login">
          <Brand />
        </Link>
        <nav>
          <Link to="/submit-payment">ส่งหลักฐาน</Link>
          <Link to="/payment-status">ตรวจสอบสถานะ</Link>
          {user && ['ADMIN', 'STAFF'].includes(user.role) && <Link to="/">กลับหน้าจัดการ</Link>}
          {user ? (
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await send('/auth/logout', {});
                  await refresh();
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              ออกจากระบบ
            </button>
          ) : (
            <Link className="button" to="/login">
              เจ้าหน้าที่
            </Link>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <footer>ศูนย์ออกกำลังกาย มหาวิทยาลัยวลัยลักษณ์ · WU Fitness</footer>
    </div>
  );
}
function Login() {
  const { user, refresh, notify } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  if (user) return <Navigate to={user.role === 'CUSTOMER' ? '/submit-payment' : '/'} replace />;
  return (
    <div className="login-page">
      <aside className="login-story">
        <Brand />
        <div>
          <span className="outline-pill">WELLNESS STARTS HERE</span>
          <h1>
            สุขภาพที่ดี
            <br />
            เริ่มต้นได้ทุกวัน<span>.</span>
          </h1>
          <p>
            ระบบบริหารจัดการศูนย์ออกกำลังกาย
            <br />
            มหาวิทยาลัยวลัยลักษณ์
          </p>
          <div className="story-lines">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <small>WALAILAK UNIVERSITY · FITNESS MANAGEMENT</small>
      </aside>
      <main className="login-form">
        <div className="login-box">
          <span className="eyebrow">ยินดีต้อนรับกลับ</span>
          <h1>เข้าสู่ระบบเจ้าหน้าที่</h1>
          <p>จัดการการเข้าใช้ สมาชิก และการชำระเงินในที่เดียว</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await send('/auth/login', { username, password });
                await refresh();
                nav('/');
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="ชื่อผู้ใช้">
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Field>
            <Field label="รหัสผ่าน">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <div className="login-divider">สำหรับผู้ใช้บริการ</div>
          <Link className="secondary full" to="/submit-payment">
            <Upload size={18} />
            ส่งหลักฐานการชำระเงิน
          </Link>
          <Link className="text-link" to="/payment-status">
            ตรวจสอบสถานะรายการ <ChevronRight size={16} />
          </Link>
          <div className="secure-note">
            <ShieldCheck size={16} />
            ข้อมูลของคุณได้รับการดูแลอย่างปลอดภัย
          </div>
        </div>
      </main>
    </div>
  );
}
const navItems = [
  ['/', 'ภาพรวม', LayoutDashboard],
  ['/attendance', 'บันทึกการเข้าใช้', ClipboardList],
  ['/members', 'จัดการสมาชิก', Users],
  ['/admin/payments', 'ตรวจสอบการชำระเงิน', ReceiptText],
  ['/reports', 'รายงานและพิมพ์', FileBarChart],
] as const;
function Shell() {
  const { user, refresh, notify } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <aside className={'sidebar ' + (open ? 'open' : '')}>
        <Brand />
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navItems.map(([url, title, Icon]) => (
            <NavLink key={url} to={url} end={url === '/'} onClick={() => setOpen(false)}>
              <Icon size={19} />
              {title}
            </NavLink>
          ))}
          {user?.role === 'ADMIN' && (
            <>
              <div className="nav-label">ADMINISTRATION</div>
              <NavLink to="/settings" onClick={() => setOpen(false)}>
                <Settings size={19} />
                ตั้งค่าระบบ
              </NavLink>
              <NavLink to="/audit" onClick={() => setOpen(false)}>
                <History size={19} />
                ประวัติการทำรายการ
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="university-mark">WU</div>
          <strong>มหาวิทยาลัยวลัยลักษณ์</strong>
          <small>ศูนย์ออกกำลังกาย</small>
          <Link to="/submit-payment">
            หน้าส่งหลักฐาน <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
      {open && (
        <button className="nav-backdrop" onClick={() => setOpen(false)} aria-label="ปิดเมนู" />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="เปิดเมนู"
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            ศูนย์ออกกำลังกาย <ChevronRight size={14} />
            <strong>ระบบจัดการ</strong>
          </div>
          <div className="topbar-right">
            <span className="date-top">
              <CalendarDays size={16} />
              {dateLabel(today())}
            </span>
            <span className="avatar">{user?.name[0]}</span>
            <div className="profile">
              <strong>{user?.name}</strong>
              <small>{statusLabel[user?.role || '']}</small>
            </div>
            <button
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
              className="icon-button"
              onClick={async () => {
                try {
                  await send('/auth/logout', {});
                  await refresh();
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/members" element={<Members />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/admin/payments" element={<Payments />} />
            <Route path="/reports" element={<Reports />} />
            <Route
              path="/settings"
              element={user?.role === 'ADMIN' ? <SettingsPage /> : <Navigate to="/" />}
            />
            <Route
              path="/audit"
              element={user?.role === 'ADMIN' ? <Audits /> : <Navigate to="/" />}
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          <footer className="app-footer">
            © {new Date().getFullYear()} WU Fitness Management <span>มหาวิทยาลัยวลัยลักษณ์</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Filters({
  from,
  to,
  setFrom,
  setTo,
  children,
}: {
  from: string;
  to: string;
  setFrom: (s: string) => void;
  setTo: (s: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="filters no-print">
      <SlidersHorizontal size={17} />
      <Field label="ตั้งแต่วันที่">
        <input
          aria-label="ตั้งแต่วันที่"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </Field>
      <Field label="ถึงวันที่">
        <input
          aria-label="ถึงวันที่"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </Field>
      {children}
    </div>
  );
}
function Dashboard() {
  const { user } = useApp();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const { data: d, loading, error } = useLoad<any>(`/dashboard?from=${from}&to=${to}`);
  const stats = d
    ? [
        [
          'รายได้วันนี้',
          '฿ ' + money(d.daily.revenueSatang),
          'เฉพาะรายการที่รับรู้รายได้',
          Wallet,
          'purple',
        ],
        [
          'รายได้เดือนนี้',
          '฿ ' + money(d.monthly.revenueSatang),
          'เดือน ' +
            new Date().toLocaleDateString('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' }),
          CalendarDays,
          'blue',
        ],
        [
          'ผู้เข้าใช้วันนี้',
          d.daily.attendanceCount.toLocaleString() + ' คน',
          'เดือนนี้ ' + d.monthly.attendanceCount + ' คน',
          Users,
          'green',
        ],
        ['รอตรวจสอบ', d.pending + ' รายการ', 'หลักฐานการชำระเงิน', Clock, 'orange'],
      ]
    : [];
  return (
    <>
      <PageTitle
        eyebrow="OVERVIEW"
        title="ภาพรวมศูนย์ออกกำลังกาย"
        description={`ยินดีต้อนรับ คุณ${user?.name} มาดูความเคลื่อนไหวของศูนย์วันนี้กัน`}
        action={
          <Link to="/attendance" className="button">
            <Plus size={18} />
            บันทึกการเข้าใช้
          </Link>
        }
      />
      <div className="welcome-banner">
        <div>
          <span className="outline-pill">WALAILAK UNIVERSITY</span>
          <h2>ทุกการเคลื่อนไหว มีความหมาย</h2>
          <p>ดูแลสุขภาพของทุกคน พร้อมจัดการศูนย์ได้อย่างเป็นระบบ</p>
        </div>
        <div className="banner-art">
          <Dumbbell size={88} strokeWidth={1.3} />
          <span>
            MOVE
            <br />
            WITH PURPOSE.
          </span>
        </div>
      </div>
      <LoadState loading={loading} error={error}>
        {d && (
          <>
            <div className="stat-grid">
              {stats.map(([label, value, desc, Icon, color]: any) => (
                <div className="stat-card" key={label}>
                  <div className="stat-label">
                    {label}
                    <span className={'stat-icon ' + color}>
                      <Icon size={20} />
                    </span>
                  </div>
                  <strong>{value}</strong>
                  <small>{desc}</small>
                </div>
              ))}
            </div>
            <div className="chart-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>แนวโน้มรายได้</h2>
                    <p>รายได้ย้อนหลัง 7 วัน · บาท</p>
                  </div>
                  <span className="subtle-pill">7 วันล่าสุด</span>
                </div>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={d.last7.days.map((r: any) => ({
                        ...r,
                        value: r.revenue / 100,
                        label: r.date.slice(5),
                      }))}
                    >
                      <defs>
                        <linearGradient id="purple" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.27} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#eeeaf2" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
                      <YAxis axisLine={false} tickLine={false} fontSize={11} width={50} />
                      <Tooltip formatter={(v) => ['฿ ' + Number(v).toLocaleString(), 'รายได้']} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#8144ce"
                        strokeWidth={3}
                        fill="url(#purple)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>รายได้รายเดือน</h2>
                    <p>ปีปัจจุบัน · บาท</p>
                  </div>
                  <Activity size={19} />
                </div>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.months.map((r: any) => ({ ...r, value: r.revenue / 100 }))}>
                      <CartesianGrid vertical={false} stroke="#eeeaf2" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} />
                      <YAxis axisLine={false} tickLine={false} fontSize={11} width={45} />
                      <Tooltip />
                      <Bar
                        dataKey="value"
                        name="รายได้ (บาท)"
                        fill="#b394df"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>สถิติตามช่วงเวลาที่เลือก</h2>
                  <p>จำนวนการเข้าใช้และรายได้จากฐานข้อมูล</p>
                </div>
              </div>
              <Filters {...{ from, to, setFrom, setTo }} />
              <div className="range-summary">
                <span>
                  รายได้รวม <strong>฿ {money(d.selected.revenueSatang)}</strong>
                </span>
                <span>
                  เข้าใช้ทั้งหมด <strong>{d.selected.attendanceCount} ครั้ง</strong>
                </span>
                <span>
                  สมาชิกเข้าใช้{' '}
                  <strong>
                    {d.selected.memberVisits} ครั้ง / {d.selected.uniqueMembers} คน
                  </strong>
                </span>
              </div>
              <div className="category-stats">
                {d.selected.categories.map((c: any) => (
                  <div key={c.id}>
                    <div>
                      <span>{c.name}</span>
                      <strong>{c.count} คน</strong>
                    </div>
                    <div className="progress">
                      <span
                        style={{
                          width:
                            (d.selected.attendanceCount
                              ? (c.count / d.selected.attendanceCount) * 100
                              : 0) + '%',
                        }}
                      />
                    </div>
                    <small>รายได้ ฿ {money(c.revenueSatang)}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </LoadState>
    </>
  );
}
function Members() {
  const { notify } = useApp();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any>(undefined);
  const [history, setHistory] = useState<any>(null);
  const { data, loading, error, load } = useLoad<any[]>(`/members?q=${encodeURIComponent(q)}`);
  const showHistory = async (id: string) => {
    try {
      setHistory(await api('/members/' + id));
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="MEMBERS"
        title="จัดการสมาชิก"
        description="ดูแลข้อมูลสมาชิก ตรวจสอบสิทธิ์ และประวัติการเข้าใช้"
        action={
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={18} />
            เพิ่มสมาชิก
          </button>
        }
      />
      <section className="panel">
        <div className="panel-head">
          <h2>ทะเบียนสมาชิก</h2>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="ค้นหาสมาชิก"
              placeholder="ค้นหาชื่อหรือเลขสมาชิก…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <LoadState {...{ loading, error }}>
          {!data?.length ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>เลขสมาชิก</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>ประเภท</th>
                    <th>ระยะเวลาสมาชิก</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.number}</strong>
                      </td>
                      <td>{m.name}</td>
                      <td>{m.category.name}</td>
                      <td>
                        {dateLabel(m.startDate)} – {dateLabel(m.endDate)}
                      </td>
                      <td>
                        <span
                          className={
                            'badge ' +
                            (!m.active || m.endDate < today()
                              ? 'rejected'
                              : m.startDate > today()
                                ? 'pending'
                                : 'approved')
                          }
                        >
                          {!m.active
                            ? 'ปิดใช้งาน'
                            : m.endDate < today()
                              ? 'หมดอายุ'
                              : m.startDate > today()
                                ? 'ยังไม่เริ่ม'
                                : 'ใช้งานได้'}
                        </span>
                      </td>
                      <td>
                        <button className="text-button" onClick={() => setEditing(m)}>
                          แก้ไข
                        </button>
                        <button className="text-button" onClick={() => showHistory(m.id)}>
                          ประวัติ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadState>
      </section>
      {editing !== undefined && (
        <MemberForm
          member={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
      {history && (
        <Modal title={'ประวัติการเข้าใช้ · ' + history.name} onClose={() => setHistory(null)}>
          <p>
            เลขสมาชิก {history.number} · {history.attendances.length} ครั้ง
          </p>
          {!history.attendances.length ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ประเภท</th>
                    <th>ผู้บันทึก</th>
                  </tr>
                </thead>
                <tbody>
                  {history.attendances.map((a: any) => (
                    <tr key={a.id}>
                      <td>{dateLabel(a.date)}</td>
                      <td>{a.category.name}</td>
                      <td>{a.recorder.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
function MemberForm({
  member,
  onClose,
  onSaved,
}: {
  member: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { categories, notify } = useApp();
  const [f, setF] = useState(
    member
      ? {
          number: member.number,
          name: member.name,
          categoryId: member.categoryId,
          startDate: member.startDate,
          endDate: member.endDate,
          active: member.active,
        }
      : {
          number: '',
          name: '',
          categoryId: '',
          startDate: today(),
          endDate: today(),
          active: true,
        },
  );
  const [busy, setBusy] = useState(false);
  const change = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal title={member ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิกใหม่'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send('/members' + (member ? '/' + member.id : ''), f, member ? 'PUT' : 'POST');
            notify('บันทึกสมาชิกแล้ว');
            onSaved();
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="เลขสมาชิก">
            <input
              required
              maxLength={50}
              value={f.number}
              onChange={(e) => change('number', e.target.value)}
            />
          </Field>
          <Field label="ชื่อ-นามสกุล">
            <input
              required
              maxLength={200}
              value={f.name}
              onChange={(e) => change('name', e.target.value)}
            />
          </Field>
          <Field label="ประเภทสมาชิก">
            <CategorySelect
              value={f.categoryId}
              onChange={(v) => {
                const days = categories.find((c) => c.id === v)?.durationDays || 0;
                const d = new Date(f.startDate + 'T00:00:00Z');
                d.setUTCDate(d.getUTCDate() + days);
                setF({ ...f, categoryId: v, endDate: d.toISOString().slice(0, 10) });
              }}
            />
          </Field>
          <Field label="สถานะ">
            <select
              value={String(f.active)}
              onChange={(e) => change('active', e.target.value === 'true')}
            >
              <option value="true">เปิดใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
            </select>
          </Field>
          <Field label="วันที่เริ่มสมาชิก">
            <input
              required
              type="date"
              value={f.startDate}
              onChange={(e) => change('startDate', e.target.value)}
            />
          </Field>
          <Field label="วันที่หมดอายุ">
            <input
              required
              type="date"
              min={f.startDate}
              value={f.endDate}
              onChange={(e) => change('endDate', e.target.value)}
            />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="primary" disabled={busy}>
            บันทึกสมาชิก
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Attendance() {
  const { notify } = useApp();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<any>(undefined);
  const { data, loading, error, load } = useLoad<any[]>(
    `/attendance?from=${from}&to=${to}&categoryId=${category}`,
  );
  const cancel = async (id: string) => {
    const reason = prompt('เหตุผลที่ยกเลิกรายการ (จำเป็น)');
    if (!reason?.trim()) return;
    try {
      await send(`/attendance/${id}/cancel`, { reason });
      notify('ยกเลิกรายการแล้ว');
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="ATTENDANCE"
        title="บันทึกการเข้าใช้"
        description="บันทึกจำนวนผู้ใช้บริการ คำนวณรายได้ และตรวจสอบย้อนหลัง"
        action={
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={18} />
            เพิ่มการเข้าใช้
          </button>
        }
      />
      <section className="panel">
        <Filters {...{ from, to, setFrom, setTo }}>
          <Field label="ประเภทผู้ใช้บริการ">
            <CategorySelect value={category} onChange={setCategory} all />
          </Field>
        </Filters>
        <LoadState {...{ loading, error }}>
          {!data?.length ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ประเภท / สมาชิก</th>
                    <th>จำนวน</th>
                    <th>ราคา/คน</th>
                    <th>รวม</th>
                    <th>การชำระ</th>
                    <th>ผู้บันทึก</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id} className={a.cancelled ? 'cancelled' : ''}>
                      <td>{dateLabel(a.date)}</td>
                      <td>
                        {a.category.name}
                        <small className="cell-sub">
                          {a.member?.number} {a.note}
                        </small>
                      </td>
                      <td>{a.count}</td>
                      <td>฿ {money(a.unitPriceSatang)}</td>
                      <td>
                        <strong>฿ {money(a.totalSatang)}</strong>
                      </td>
                      <td>{a.cancelled ? <Badge status="ยกเลิก" /> : statusLabel[a.method]}</td>
                      <td>{a.recorder.name}</td>
                      <td>
                        {!a.cancelled && (
                          <>
                            <button className="text-button" onClick={() => setEditing(a)}>
                              แก้ไข
                            </button>
                            <button className="text-button danger" onClick={() => cancel(a.id)}>
                              ยกเลิก
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadState>
      </section>
      {editing !== undefined && (
        <AttendanceForm
          item={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
    </>
  );
}
function AttendanceForm({
  item,
  onClose,
  onSaved,
}: {
  item: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { categories, notify } = useApp();
  const [f, setF] = useState({
    date: item?.date || today(),
    categoryId: item?.categoryId || '',
    count: item?.count || 1,
    memberNumber: item?.member?.number || '',
    paymentId: item?.paymentId || '',
    method: item?.method || 'CASH',
    note: item?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const cat = categories.find((c) => c.id === f.categoryId);
  const change = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const { data: payments } = useLoad<any[]>(
    `/payments?from=${f.date}&to=${f.date}&status=APPROVED`,
  );
  return (
    <Modal title={item ? 'แก้ไขการเข้าใช้' : 'บันทึกการเข้าใช้'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send(
              '/attendance' + (item ? '/' + item.id : ''),
              { ...f, count: Number(f.count) },
              item ? 'PUT' : 'POST',
            );
            notify('บันทึกการเข้าใช้แล้ว');
            onSaved();
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="วันที่เข้าใช้">
            <input
              required
              type="date"
              value={f.date}
              onChange={(e) => change('date', e.target.value)}
            />
          </Field>
          <Field label="ประเภทบริการ">
            <CategorySelect value={f.categoryId} onChange={(v) => change('categoryId', v)} />
          </Field>
          <Field label="จำนวนผู้เข้าใช้">
            <input
              required
              type="number"
              min="1"
              max="10000"
              value={f.count}
              onChange={(e) => change('count', e.target.value)}
            />
          </Field>
          <Field label="เลขสมาชิก (ถ้ามี)">
            <input
              maxLength={50}
              value={f.memberNumber}
              onChange={(e) => change('memberNumber', e.target.value)}
            />
          </Field>
          <Field label="วิธีรับชำระ / สิทธิ์">
            <select value={f.method} onChange={(e) => change('method', e.target.value)}>
              <option value="CASH">เงินสด</option>
              <option value="MEMBER">ใช้สิทธิ์สมาชิก (ไม่คิดเงินเพิ่ม)</option>
              <option value="PAYMENT">รายการชำระเงินที่อนุมัติแล้ว</option>
            </select>
          </Field>
          {f.method === 'PAYMENT' && (
            <Field label="รายการที่อนุมัติ (วันที่เดียวกัน)">
              <select
                required
                value={f.paymentId}
                onChange={(e) => change('paymentId', e.target.value)}
              >
                <option value="">เลือกรายการ</option>
                {payments
                  ?.filter((p) => !p.cancelled)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.reference} · {p.payerName} · ฿{money(p.amountSatang)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="หมายเหตุ">
            <textarea
              maxLength={1000}
              value={f.note}
              onChange={(e) => change('note', e.target.value)}
            />
          </Field>
        </div>
        <div className="calculation">
          <span>
            {f.count} คน × ฿ {money(f.method === 'MEMBER' ? 0 : cat?.priceSatang || 0)}
          </span>
          <strong>
            ฿ {money((f.method === 'MEMBER' ? 0 : cat?.priceSatang || 0) * Number(f.count))}
          </strong>
        </div>
        <p className="help">
          รายการโอนที่อนุมัติแล้วจะไม่บันทึกรายได้ซ้ำ · สมาชิกต้องมีสิทธิ์ใช้งานในวันที่เลือก
        </p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="primary" disabled={busy}>
            บันทึกข้อมูล
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SubmitPayment() {
  const { notify, user } = useApp();
  const [f, setF] = useState({
    payerName: '',
    memberNumber: '',
    categoryId: '',
    date: today(),
    amount: '',
    method: 'TRANSFER',
    note: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const change = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const { categories } = useApp();
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <>
      <PageTitle
        eyebrow="PAYMENT SUBMISSION"
        title="ส่งหลักฐานการชำระเงิน"
        description="แนบหลักฐานของคุณ เพื่อให้เจ้าหน้าที่ตรวจสอบการชำระเงิน"
      />
      {result ? (
        <section className="panel success-panel">
          <CheckCircle2 size={52} />
          <h2>ส่งหลักฐานเรียบร้อยแล้ว</h2>
          <Badge status="PENDING" />
          <p>โปรดเก็บเลขอ้างอิงและรหัสตรวจสอบไว้ รหัสนี้แสดงเพียงครั้งเดียว</p>
          <label>
            เลขอ้างอิง
            <input readOnly value={result.reference} />
          </label>
          <label>
            รหัสตรวจสอบส่วนตัว
            <input readOnly value={result.verificationCode} />
          </label>
          <p className="help">
            อย่าส่งต่อรหัสตรวจสอบให้ผู้อื่น · การอนุมัติเป็นการตรวจโดยเจ้าหน้าที่
          </p>
          <Link to="/payment-status" className="button">
            ตรวจสอบสถานะ
          </Link>
          <button
            className="secondary"
            onClick={() => {
              setResult(null);
              setFile(null);
              setF({
                payerName: '',
                memberNumber: '',
                categoryId: '',
                date: today(),
                amount: '',
                method: 'TRANSFER',
                note: '',
              });
            }}
          >
            ส่งรายการใหม่
          </button>
        </section>
      ) : (
        <section className="panel payment-form">
          <div className="section-label">
            <span>01</span>
            <h2>ข้อมูลการชำระเงิน</h2>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!file) return notify('กรุณาแนบสลิป', true);
              setBusy(true);
              try {
                const form = new FormData();
                Object.entries({
                  ...f,
                  amountSatang: String(Math.round(Number(f.amount) * 100)),
                }).forEach(([k, v]) => {
                  if (k !== 'amount') form.append(k, v);
                });
                form.append('slip', file);
                setResult(await api('/payments', { method: 'POST', body: form }));
                notify('ส่งหลักฐานสำเร็จ');
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="ชื่อ-นามสกุล">
                <input
                  required
                  maxLength={200}
                  value={f.payerName}
                  onChange={(e) => change('payerName', e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field label="เลขสมาชิก (ถ้ามี)">
                <input
                  maxLength={50}
                  value={f.memberNumber}
                  onChange={(e) => change('memberNumber', e.target.value)}
                />
              </Field>
              <Field label="ประเภทผู้ใช้บริการ">
                <CategorySelect
                  value={f.categoryId}
                  onChange={(v) =>
                    setF({
                      ...f,
                      categoryId: v,
                      amount: String((categories.find((c) => c.id === v)?.priceSatang || 0) / 100),
                    })
                  }
                />
              </Field>
              <Field label="วันที่ทำรายการ">
                <input
                  required
                  type="date"
                  value={f.date}
                  onChange={(e) => change('date', e.target.value)}
                />
              </Field>
              <Field label="จำนวนเงิน (บาท)">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="1000000"
                  value={f.amount}
                  onChange={(e) => change('amount', e.target.value)}
                />
              </Field>
              <Field label="ช่องทางชำระเงิน">
                <select value={f.method} onChange={(e) => change('method', e.target.value)}>
                  <option value="TRANSFER">โอนเงิน</option>
                  {user && ['ADMIN', 'STAFF'].includes(user.role) && (
                    <option value="CASH">เงินสด (เจ้าหน้าที่)</option>
                  )}
                </select>
              </Field>
            </div>
            <div className="section-label">
              <span>02</span>
              <h2>หลักฐานการชำระเงิน</h2>
            </div>
            <label className="upload-box">
              <Upload size={28} />
              <strong>เลือกรูปสลิปการชำระเงิน</strong>
              <span>JPG, PNG, WEBP · ขนาดไม่เกิน 5 MB</span>
              <input
                aria-label="แนบรูปสลิป"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected && selected.size > 5 * 1024 * 1024) {
                    notify('ไฟล์ต้องไม่เกิน 5 MB', true);
                    e.target.value = '';
                    setFile(null);
                  } else setFile(selected || null);
                }}
              />
              {file && <small>{file.name}</small>}
            </label>
            {preview && <img className="slip-preview" src={preview} alt="ตัวอย่างสลิปก่อนส่ง" />}
            <Field label="หมายเหตุ">
              <textarea
                maxLength={1000}
                value={f.note}
                onChange={(e) => change('note', e.target.value)}
              />
            </Field>
            <div className="notice">
              <ShieldCheck size={20} />
              <span>
                สลิปเข้าถึงได้เฉพาะเจ้าหน้าที่ที่มีสิทธิ์
                การส่งหลักฐานยังไม่ถือว่าชำระเงินสำเร็จจนกว่าจะได้รับการตรวจสอบ
              </span>
            </div>
            <button className="primary full" disabled={busy}>
              {busy ? 'กำลังส่งหลักฐาน…' : 'ส่งหลักฐานการชำระเงิน'}
              <ArrowUpRight size={18} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
function PaymentStatus() {
  const { notify } = useApp();
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="PAYMENT TRACKING"
        title="ตรวจสอบสถานะการชำระเงิน"
        description="ใช้เลขอ้างอิงและรหัสตรวจสอบส่วนตัวที่ได้รับหลังส่งหลักฐาน"
      />
      <section className="panel tracking">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setResult(null);
            try {
              setResult(await send('/payments/lookup', { reference, verificationCode: code }));
            } catch (e) {
              notify((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="เลขอ้างอิงรายการ">
            <input
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="WU-…"
            />
          </Field>
          <Field label="รหัสตรวจสอบส่วนตัว">
            <input
              required
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <button className="primary full" disabled={busy}>
            <Search size={18} />
            ตรวจสอบสถานะ
          </button>
        </form>
        {result && (
          <div className="tracking-result">
            <Badge status={result.cancelled ? 'ยกเลิก' : result.status} />
            <h2>{result.reference}</h2>
            <p>
              {dateLabel(result.date)} · ฿ {money(result.amountSatang)}
            </p>
            {result.rejectionReason && <p>เหตุผล: {result.rejectionReason}</p>}
          </div>
        )}
      </section>
    </>
  );
}
function Payments() {
  const { notify } = useApp();
  const [from, setFrom] = useState(today().slice(0, 7) + '-01');
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('');
  const [slip, setSlip] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, load } = useLoad<any[]>(
    `/payments?from=${from}&to=${to}&status=${status}`,
  );
  const act = async (p: any, action: string) => {
    let reason: string | null = null;
    if (action !== 'approve') {
      reason = prompt(
        action === 'reject' ? 'เหตุผลที่ปฏิเสธ (จำเป็น)' : 'เหตุผลที่ยกเลิก (จำเป็น)',
      );
      if (!reason?.trim()) return;
    } else if (
      !confirm('ยืนยันอนุมัติรายการ ' + p.reference + ' จำนวน ฿' + money(p.amountSatang) + ' ?')
    )
      return;
    setBusy(true);
    try {
      await send(`/payments/${p.id}/${action}`, { reason });
      notify('บันทึกผลแล้ว');
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="PAYMENTS"
        title="ตรวจสอบการชำระเงิน"
        description="ตรวจหลักฐาน อนุมัติรายการ และติดตามรายได้อย่างเป็นระบบ"
        action={
          <Link to="/submit-payment" className="button">
            <Plus size={18} />
            แนบสลิปแทนผู้ใช้บริการ
          </Link>
        }
      />
      <div className="notice">
        <ShieldCheck size={20} />
        <span>
          การอนุมัติเป็นการตรวจสอบโดยเจ้าหน้าที่ โปรดตรวจยอด วันที่
          และบัญชีปลายทางกับข้อมูลรับเงินจริงก่อนอนุมัติ
        </span>
      </div>
      <section className="panel">
        <Filters {...{ from, to, setFrom, setTo }}>
          <Field label="สถานะ">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทุกสถานะ</option>
              {['PENDING', 'APPROVED', 'REJECTED'].map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </Field>
        </Filters>
        <LoadState {...{ loading, error }}>
          {!data?.length ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>เลขอ้างอิง / วันที่</th>
                    <th>ชื่อผู้ชำระ / ประเภท</th>
                    <th>จำนวนเงิน</th>
                    <th>ผู้ส่งรายการ</th>
                    <th>สถานะ / ผู้ตรวจ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong className="reference">{p.reference}</strong>
                        <small className="cell-sub">{dateLabel(p.date)}</small>
                      </td>
                      <td>
                        {p.payerName}
                        <small className="cell-sub">{p.category.name}</small>
                      </td>
                      <td>
                        <strong>฿ {money(p.amountSatang)}</strong>
                        <small className="cell-sub">{statusLabel[p.method]}</small>
                      </td>
                      <td>{p.submittedBy?.name || 'ผู้ใช้บริการ'}</td>
                      <td>
                        <Badge status={p.cancelled ? 'ยกเลิก' : p.status} />
                        <small className="cell-sub">
                          {p.reviewer?.name}{' '}
                          {p.reviewedAt &&
                            new Date(p.reviewedAt).toLocaleString('th-TH', {
                              timeZone: 'Asia/Bangkok',
                            })}
                        </small>
                        {p.rejectionReason && (
                          <small className="cell-sub">{p.rejectionReason}</small>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="secondary compact" onClick={() => setSlip(p)}>
                            <Eye size={15} />
                            ดูสลิป
                          </button>
                          {p.status === 'PENDING' && !p.cancelled && (
                            <>
                              <button
                                className="approve compact"
                                disabled={busy}
                                onClick={() => act(p, 'approve')}
                              >
                                <Check size={15} />
                                อนุมัติ
                              </button>
                              <button
                                className="text-button danger"
                                disabled={busy}
                                onClick={() => act(p, 'reject')}
                              >
                                ปฏิเสธ
                              </button>
                            </>
                          )}
                          {!p.cancelled && (
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() => act(p, 'cancel')}
                            >
                              ยกเลิกรายการ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadState>
      </section>
      {slip && (
        <Modal title={'สลิป · ' + slip.reference} onClose={() => setSlip(null)}>
          <img
            className="slip-large"
            src={'/api/payments/' + slip.id + '/slip'}
            alt={'สลิปของ ' + slip.payerName}
          />
          <p>
            {slip.payerName} · ฿ {money(slip.amountSatang)}
          </p>
        </Modal>
      )}
    </>
  );
}
function Reports() {
  const [kind, setKind] = useState('daily');
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [from, setFrom] = useState(today().slice(0, 7) + '-01');
  const [to, setTo] = useState(today());
  const [orientation, setOrientation] = useState('portrait');
  const url =
    kind === 'daily'
      ? `/reports/daily?date=${day}`
      : kind === 'monthly'
        ? `/reports/monthly?month=${month}`
        : `/reports/payments?from=${from}&to=${to}`;
  const { data: d, loading, error } = useLoad<any>(url);
  return (
    <>
      <div className="no-print">
        <PageTitle
          eyebrow="REPORTS"
          title="รายงานและพิมพ์เอกสาร"
          description="สรุปข้อมูลจริงจากระบบ พร้อมพิมพ์ A4 หรือบันทึกเป็น PDF"
          action={
            <button
              className="primary"
              disabled={!d || loading || !!error}
              onClick={() => window.print()}
            >
              <Printer size={18} />
              พิมพ์รายงาน
            </button>
          }
        />
        <section className="panel report-controls">
          <Field label="ประเภทรายงาน">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="daily">รายงานรายวัน</option>
              <option value="monthly">รายงานรายเดือน</option>
              <option value="payments">รายงานการชำระเงิน</option>
            </select>
          </Field>
          {kind === 'daily' ? (
            <Field label="วันที่รายงาน">
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
          ) : kind === 'monthly' ? (
            <Field label="เดือน">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="ตั้งแต่วันที่">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="ถึงวันที่">
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="แนวกระดาษ">
            <select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
              <option value="portrait">แนวตั้ง</option>
              <option value="landscape">แนวนอน</option>
            </select>
          </Field>
        </section>
      </div>
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`}</style>
      <LoadState {...{ loading, error }}>
        {d && (
          <article className="report-sheet">
            <header className="report-heading">
              <div className="report-seal">
                <Dumbbell size={30} />
              </div>
              <h2>มหาวิทยาลัยวลัยลักษณ์</h2>
              <h3>{d.settings.department}</h3>
              <p>
                {kind === 'daily'
                  ? 'รายงานผู้เข้าใช้และรายได้ประจำวัน'
                  : kind === 'monthly'
                    ? 'รายงานผู้เข้าใช้และรายได้ประจำเดือน'
                    : 'รายงานการชำระเงิน'}
              </p>
              <strong>
                {dateLabel(d.from)} {d.to !== d.from ? '– ' + dateLabel(d.to) : ''}
              </strong>
              <small>เอกสารจากระบบบริหารจัดการ · ยังไม่ใช่แบบฟอร์มที่มหาวิทยาลัยรับรอง</small>
            </header>
            <div className="report-totals">
              <span>
                ผู้เข้าใช้ <strong>{d.attendanceCount} ครั้ง</strong>
              </span>
              <span>
                สมาชิก{' '}
                <strong>
                  {d.memberVisits} ครั้ง / {d.uniqueMembers} คน
                </strong>
              </span>
              <span>
                รายได้รวม <strong>฿ {money(d.revenueSatang)}</strong>
              </span>
            </div>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  {kind === 'payments' ? (
                    <tr>
                      <th>เลขอ้างอิง</th>
                      <th>วันที่</th>
                      <th>ประเภท</th>
                      <th>จำนวนเงิน</th>
                      <th>สถานะ</th>
                      <th>ผู้ตรวจสอบ</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>ประเภทผู้ใช้บริการ</th>
                      <th>จำนวน (ครั้ง)</th>
                      <th>อัตราที่บันทึก (บาท)</th>
                      <th>รายได้ (บาท)</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {kind === 'payments'
                    ? d.payments.map((p: any) => (
                        <tr key={p.id}>
                          <td>{p.reference}</td>
                          <td>{p.date}</td>
                          <td>{p.category.name}</td>
                          <td>{money(p.amountSatang)}</td>
                          <td>{p.cancelled ? 'ยกเลิก' : statusLabel[p.status]}</td>
                          <td>{p.reviewer?.name || '–'}</td>
                        </tr>
                      ))
                    : d.categories.map((c: any) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td>{c.count}</td>
                          <td>
                            {c.rates.length ? c.rates.map((n: number) => money(n)).join(', ') : '–'}
                          </td>
                          <td>{money(c.revenueSatang)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {kind === 'monthly' && (
              <>
                <h3>รายได้แยกตามวัน</h3>
                <div className="table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>ผู้เข้าใช้ (ครั้ง)</th>
                        <th>รายได้ (บาท)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.days.map((r: any) => (
                        <tr key={r.date}>
                          <td>{dateLabel(r.date)}</td>
                          <td>{r.count}</td>
                          <td>{money(r.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="report-money">
              <span>รายได้เงินสด ฿ {money(d.cashSatang)}</span>
              <span>รายได้จากการโอน ฿ {money(d.transferSatang)}</span>
            </div>
            <p className="help">
              รายได้รวมเฉพาะเงินสดจากการเข้าใช้และรายการชำระเงินที่อนุมัติแล้ว ไม่รวมรายการยกเลิก
              จำนวนผู้เข้าใช้นับตามวันที่เข้าใช้ รายได้โอนนับตามวันที่ชำระ
            </p>
            <div className="signatures">
              <div>
                ลงชื่อ ___________________________
                <br />
                ผู้จัดทำรายงาน
                <br />
                วันที่ ____ / ____ / ______
              </div>
              <div>
                ลงชื่อ ___________________________
                <br />
                ผู้ตรวจสอบ
                <br />
                วันที่ ____ / ____ / ______
              </div>
            </div>
          </article>
        )}
      </LoadState>
    </>
  );
}
function SettingsPage() {
  const { categories, reloadCategories, notify } = useApp();
  const [tab, setTab] = useState('categories');
  const [editing, setEditing] = useState<any>(undefined);
  const [userEdit, setUserEdit] = useState<any>(undefined);
  const {
    data: users,
    load: loadUsers,
    error: userError,
    loading: userLoading,
  } = useLoad<any[]>('/users');
  const { data: settings } = useLoad<any>('/settings');
  const [department, setDepartment] = useState('');
  useEffect(() => {
    if (settings) setDepartment(settings.department || '');
  }, [settings]);
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION"
        title="ตั้งค่าระบบ"
        description="จัดการประเภทบริการ อัตราค่าบริการ และบัญชีผู้ใช้งาน"
      />
      <div className="tabs">
        {[
          ['categories', 'ประเภทและราคา'],
          ['users', 'บัญชีผู้ใช้งาน'],
          ['general', 'หน่วยงาน'],
        ].map(([v, l]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'categories' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>ประเภทผู้ใช้บริการ</h2>
              <p>อัตราเริ่มต้นเป็นตัวอย่าง ต้องยืนยันกับมหาวิทยาลัยก่อนใช้งานจริง</p>
            </div>
            <button className="primary" onClick={() => setEditing(null)}>
              <Plus size={16} />
              เพิ่มประเภท
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ประเภท</th>
                  <th>ราคา (บาท)</th>
                  <th>ระยะเวลา</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{money(c.priceSatang)}</td>
                    <td>{c.durationDays ? c.durationDays + ' วัน' : 'รายครั้ง'}</td>
                    <td>
                      <Badge status={c.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} />
                    </td>
                    <td>
                      <button className="text-button" onClick={() => setEditing(c)}>
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === 'users' && (
        <section className="panel">
          <div className="panel-head">
            <h2>บัญชีผู้ใช้งาน</h2>
            <button className="primary" onClick={() => setUserEdit(null)}>
              <Plus size={16} />
              เพิ่มบัญชี
            </button>
          </div>
          <LoadState loading={userLoading} error={userError}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ชื่อผู้ใช้</th>
                    <th>ชื่อ</th>
                    <th>สิทธิ์</th>
                    <th>สถานะ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users?.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.name}</td>
                      <td>{statusLabel[u.role]}</td>
                      <td>{u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                      <td>
                        <button className="text-button" onClick={() => setUserEdit(u)}>
                          แก้ไข
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </LoadState>
        </section>
      )}
      {tab === 'general' && (
        <section className="panel narrow">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await send('/settings', { department }, 'PUT');
                notify('บันทึกชื่อหน่วยงานแล้ว');
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            <Field label="ชื่อหน่วยงานในรายงาน">
              <input
                required
                maxLength={200}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </Field>
            <button className="primary">บันทึกการตั้งค่า</button>
          </form>
        </section>
      )}
      {editing !== undefined && (
        <CategoryForm
          item={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reloadCategories();
          }}
        />
      )}
      {userEdit !== undefined && (
        <UserForm
          item={userEdit}
          onClose={() => setUserEdit(undefined)}
          onSaved={async () => {
            setUserEdit(undefined);
            await loadUsers();
          }}
        />
      )}
    </>
  );
}
function CategoryForm({
  item,
  onClose,
  onSaved,
}: {
  item: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useApp();
  const [f, setF] = useState(
    item
      ? {
          code: item.code,
          name: item.name,
          price: item.priceSatang / 100,
          durationDays: item.durationDays,
          active: item.active,
        }
      : { code: '', name: '', price: 0, durationDays: 0, active: true },
  );
  const [busy, setBusy] = useState(false);
  const change = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal title={item ? 'แก้ไขประเภทบริการ' : 'เพิ่มประเภทบริการ'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send(
              '/categories' + (item ? '/' + item.id : ''),
              {
                code: f.code,
                name: f.name,
                priceSatang: Math.round(Number(f.price) * 100),
                durationDays: Number(f.durationDays),
                active: f.active,
              },
              item ? 'PUT' : 'POST',
            );
            notify('บันทึกประเภทบริการแล้ว');
            onSaved();
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="รหัสประเภท">
            <input
              required
              pattern="[A-Za-z0-9_-]{1,30}"
              value={f.code}
              onChange={(e) => change('code', e.target.value)}
            />
          </Field>
          <Field label="ชื่อประเภท">
            <input
              required
              maxLength={200}
              value={f.name}
              onChange={(e) => change('name', e.target.value)}
            />
          </Field>
          <Field label="อัตราค่าบริการ (บาท)">
            <input
              required
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              value={f.price}
              onChange={(e) => change('price', e.target.value)}
            />
          </Field>
          <Field label="ระยะเวลา (วัน, 0 = รายครั้ง)">
            <input
              required
              type="number"
              min="0"
              max="3650"
              value={f.durationDays}
              onChange={(e) => change('durationDays', e.target.value)}
            />
          </Field>
          <Field label="สถานะ">
            <select
              value={String(f.active)}
              onChange={(e) => change('active', e.target.value === 'true')}
            >
              <option value="true">เปิดใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            บันทึกประเภทบริการ
          </button>
        </div>
      </form>
    </Modal>
  );
}
function UserForm({
  item,
  onClose,
  onSaved,
}: {
  item: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useApp();
  const [f, setF] = useState({
    username: item?.username || '',
    name: item?.name || '',
    role: item?.role || 'STAFF',
    active: item?.active ?? true,
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const change = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal title={item ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีผู้ใช้งาน'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send(
              '/users' + (item ? '/' + item.id : ''),
              { ...f, password: f.password || undefined },
              item ? 'PUT' : 'POST',
            );
            notify('บันทึกบัญชีแล้ว (การแก้ไขจะยกเลิกเซสชันของบัญชีนี้)');
            onSaved();
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="ชื่อผู้ใช้">
            <input
              required
              pattern="[A-Za-z0-9_.-]{3,50}"
              value={f.username}
              onChange={(e) => change('username', e.target.value)}
            />
          </Field>
          <Field label="ชื่อ-นามสกุล">
            <input
              required
              maxLength={200}
              value={f.name}
              onChange={(e) => change('name', e.target.value)}
            />
          </Field>
          <Field label="สิทธิ์">
            <select value={f.role} onChange={(e) => change('role', e.target.value)}>
              {['ADMIN', 'STAFF', 'CUSTOMER'].map((r) => (
                <option key={r} value={r}>
                  {statusLabel[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="สถานะ">
            <select
              value={String(f.active)}
              onChange={(e) => change('active', e.target.value === 'true')}
            >
              <option value="true">เปิดใช้งาน</option>
              <option value="false">ปิดใช้งาน</option>
            </select>
          </Field>
          <Field
            label={item ? 'รหัสผ่านใหม่ (เว้นว่างเพื่อคงเดิม)' : 'รหัสผ่าน (อย่างน้อย 12 ตัวอักษร)'}
          >
            <input
              required={!item}
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={f.password}
              onChange={(e) => change('password', e.target.value)}
            />
          </Field>
        </div>
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            บันทึกบัญชี
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Audits() {
  const { data, loading, error } = useLoad<any[]>('/audit');
  return (
    <>
      <PageTitle
        eyebrow="AUDIT TRAIL"
        title="ประวัติการทำรายการ"
        description="ตรวจสอบการเพิ่ม แก้ไข อนุมัติ และยกเลิกข้อมูลย้อนหลัง (300 รายการล่าสุด)"
      />
      <section className="panel">
        <LoadState {...{ loading, error }}>
          {!data?.length ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>วันเวลา</th>
                    <th>ผู้ดำเนินการ</th>
                    <th>การกระทำ</th>
                    <th>ข้อมูล</th>
                    <th>รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {new Date(a.createdAt).toLocaleString('th-TH', {
                          timeZone: 'Asia/Bangkok',
                        })}
                      </td>
                      <td>{a.actor?.name || 'ผู้ใช้บริการ'}</td>
                      <td>{a.action}</td>
                      <td>
                        {a.entity}
                        <small className="cell-sub">{a.entityId}</small>
                      </td>
                      <td>
                        <details>
                          <summary>ก่อน / หลัง</summary>
                          <pre>{a.before || '–'}</pre>
                          <pre>{a.after || '–'}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadState>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
