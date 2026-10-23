import { NavLink, Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Building2,
  Package,
  Users,
  Warehouse,
  ClipboardList,
  Wallet,
  CalendarDays,
  BarChart3,
  Bell,
  ShieldAlert,
  ScrollText,
  DatabaseBackup,
  Settings,
  LogOut,
  Menu,
  X,
  ArrowLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import AshokAssistant from '../ai/AshokAssistant';
import { useOnline } from '../hooks/useOnline';
import { LANG_OPTIONS } from '../i18n';
import i18n from '../i18n';
import clsx from 'clsx';
import api from '../services/api';

export default function AppLayout() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const navigate = useNavigate();
  const location = useLocation();
  const { branchId: workspaceBranchId } = useParams<{ branchId?: string }>();
  const online = useOnline();
  const [openNav, setOpenNav] = useState(false);
  const isMain = user?.role === 'MAIN_ADMIN';
  const inWorkspace = isMain && location.pathname.includes('/main/workspace/');

  const mainLinks = [
    { to: '/main', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/main/branches', icon: Building2, label: t('nav.branches') },
    { to: '/main/items', icon: Package, label: t('nav.items') },
    { to: '/main/stock', icon: Warehouse, label: t('nav.stock') },
    { to: '/main/requests', icon: ClipboardList, label: t('nav.requests') },
    { to: '/main/employees', icon: Users, label: t('nav.employees') },
    { to: '/main/payments', icon: Wallet, label: t('nav.payments') },
    { to: '/main/expenses', icon: Wallet, label: 'Expenses' },
    { to: '/main/events', icon: CalendarDays, label: t('nav.events') },
    { to: '/main/reports', icon: BarChart3, label: t('nav.reports') },
    { to: '/main/notifications', icon: Bell, label: t('nav.notifications') },
    { to: '/main/audit', icon: ScrollText, label: t('nav.audit') },
    { to: '/main/fraud', icon: ShieldAlert, label: t('nav.fraud') },
    { to: '/main/backup', icon: DatabaseBackup, label: t('nav.backup') },
    { to: '/main/settings', icon: Settings, label: t('nav.settings') },
  ];

  const workspaceBase = workspaceBranchId ? `/main/workspace/${workspaceBranchId}` : '/sub';

  const subStyleLinks = [
    { to: workspaceBase, icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: `${workspaceBase}/employees`, icon: Users, label: t('nav.employees') },
    { to: `${workspaceBase}/stock`, icon: Warehouse, label: t('nav.stock') },
    { to: `${workspaceBase}/requests`, icon: ClipboardList, label: t('nav.requests') },
    { to: `${workspaceBase}/payments`, icon: Wallet, label: t('nav.payments') },
    { to: `${workspaceBase}/expenses`, icon: Wallet, label: 'Expenses' },
    { to: `${workspaceBase}/events`, icon: CalendarDays, label: t('nav.events') },
    { to: `${workspaceBase}/reports`, icon: BarChart3, label: t('nav.reports') },
    { to: `${workspaceBase}/settings`, icon: Settings, label: t('nav.settings') },
  ];

  const links = inWorkspace ? subStyleLinks : isMain ? mainLinks : subStyleLinks;

  const doLogout = async () => {
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      /* ignore */
    }
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen ashok-safe-bottom">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-40 w-72 transform border-r border-ice-100/80 bg-white/90 p-4 shadow-soft backdrop-blur-xl transition lg:static lg:translate-x-0',
            openNav ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="mb-6 flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-2xl font-semibold text-ice-900">IceFlow</div>
              <div className="text-xs text-ice-500">Branch Manager</div>
              <div className="mt-2 rounded-lg bg-ice-50 px-2 py-1 text-xs text-ice-700">
                {inWorkspace
                  ? `Sub workspace · ${user?.displayName}`
                  : `${user?.branchName || 'Main Branch'} · ${user?.displayName}`}
              </div>
              {inWorkspace && (
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-ice-700 hover:underline"
                  onClick={() => navigate('/main/branches')}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to branches
                </button>
              )}
            </div>
            <button type="button" className="lg:hidden" onClick={() => setOpenNav(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/main' || l.to === '/sub' || l.to === workspaceBase}
                onClick={() => setOpenNav(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-ice-800 text-white shadow-soft'
                      : 'text-ice-800 hover:bg-ice-50'
                  )
                }
              >
                <l.icon className="h-4 w-4 shrink-0" />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void doLogout()}
            className="mt-4 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> {t('nav.logout')}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ice-100/70 bg-white/70 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button type="button" className="lg:hidden btn-ghost !px-2" onClick={() => setOpenNav(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden sm:block text-sm text-ice-600">
                {new Date().toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                )}
              >
                {online ? t('common.online') : t('common.offline')}
              </span>
              <select
                className="input !w-auto !py-1.5 !text-xs"
                value={i18n.language}
                onChange={(e) => {
                  void i18n.changeLanguage(e.target.value);
                  localStorage.setItem('iceflow_lang', e.target.value);
                }}
              >
                {LANG_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>

      {openNav && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-ice-950/30 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpenNav(false)}
        />
      )}

      <AshokAssistant />
    </div>
  );
}
