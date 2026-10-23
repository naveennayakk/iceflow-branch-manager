import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import {
  Building2,
  ClipboardList,
  AlertTriangle,
  IndianRupee,
  ShieldAlert,
  Package,
} from 'lucide-react';

interface DashData {
  totalSubBranches: number;
  activeSubBranches: number;
  pendingStockRequests: number;
  pendingDamageRequests: number;
  todayCash: number;
  todayPhonePe: number;
  totalOutstanding: number;
  fraudAlerts: number;
  lowStock: Array<{ quantity: number; item: { name: string }; branch: { name: string } }>;
  upcomingEvents: Array<{ eventName: string; eventDate: string; branch: { name: string } }>;
  recentAudit: Array<{ action: string; createdAt: string; actor?: { displayName: string } }>;
  branchPerformance: Array<{ name: string; code: string; cash: number; phonePe: number; bills: number }>;
}

function Stat({ label, value, icon: Icon, tone = 'ice' }: { label: string; value: string | number; icon: typeof Building2; tone?: string }) {
  const tones: Record<string, string> = {
    ice: 'from-sky-50 to-white text-ice-800',
    amber: 'from-amber-50 to-white text-amber-900',
    rose: 'from-rose-50 to-white text-rose-800',
    emerald: 'from-emerald-50 to-white text-emerald-900',
  };
  return (
    <div className={`card-panel bg-gradient-to-br p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
          <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
        </div>
        <Icon className="h-5 w-5 opacity-60" />
      </div>
    </div>
  );
}

export default function MainDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    void api.get('/dashboard/main').then((r) => setData(r.data.data));
  }, []);

  if (!data) return <div className="text-ice-600">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Main Branch</h1>
        <p className="text-ice-600">Full authority overview · IceFlow</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sub-branches" value={`${data.activeSubBranches}/${data.totalSubBranches}`} icon={Building2} />
        <Stat label="Pending requests" value={data.pendingStockRequests} icon={ClipboardList} tone="amber" />
        <Stat label={t('dashboard.cash')} value={`₹${data.todayCash.toLocaleString()}`} icon={IndianRupee} tone="emerald" />
        <Stat label={t('dashboard.phonepe')} value={`₹${data.todayPhonePe.toLocaleString()}`} icon={IndianRupee} />
        <Stat label={t('dashboard.outstanding')} value={`₹${data.totalOutstanding.toLocaleString()}`} icon={AlertTriangle} tone="amber" />
        <Stat label="Damage pending" value={data.pendingDamageRequests} icon={Package} />
        <Stat label="Fraud alerts" value={data.fraudAlerts} icon={ShieldAlert} tone="rose" />
        <Stat label="Low stock lines" value={data.lowStock.length} icon={Package} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Branch performance (today)</h2>
          <div className="space-y-2">
            {data.branchPerformance.map((b) => (
              <div key={b.code} className="flex items-center justify-between rounded-xl bg-ice-50/80 px-3 py-2 text-sm">
                <div>
                  <div className="font-semibold text-ice-900">{b.name}</div>
                  <div className="text-xs text-ice-500">{b.code}</div>
                </div>
                <div className="text-right text-xs">
                  <div>Cash ₹{b.cash}</div>
                  <div>PhonePe ₹{b.phonePe}</div>
                  <div className="font-semibold">Bills ₹{b.bills}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Recent audit</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.recentAudit.map((a, i) => (
              <div key={i} className="rounded-xl border border-ice-100 px-3 py-2 text-sm">
                <div className="font-medium text-ice-900">{a.action}</div>
                <div className="text-xs text-ice-500">
                  {a.actor?.displayName || 'System'} · {new Date(a.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <Link to="/main/audit" className="mt-3 inline-block text-sm font-semibold text-ice-700 hover:underline">
            View all →
          </Link>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">{t('dashboard.lowStock')}</h2>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-ice-500">No low stock alerts</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.lowStock.slice(0, 8).map((l, i) => (
                <li key={i} className="flex justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <span>
                    {l.item.name} · {l.branch.name}
                  </span>
                  <span className="font-semibold">{l.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Upcoming events</h2>
          {data.upcomingEvents.length === 0 ? (
            <p className="text-sm text-ice-500">No upcoming events</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.upcomingEvents.map((e, i) => (
                <li key={i} className="rounded-xl bg-ice-50 px-3 py-2">
                  <div className="font-semibold">{e.eventName}</div>
                  <div className="text-xs text-ice-500">
                    {e.branch.name} · {new Date(e.eventDate).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
