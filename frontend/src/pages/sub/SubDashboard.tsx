import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { Users, UserCheck, UserX, Package } from 'lucide-react';
import { useBranchScope } from '../../hooks/useBranchScope';

export default function SubDashboard() {
  const { t } = useTranslation();
  const { branchId, qs, isMainWorkspace } = useBranchScope();
  const [data, setData] = useState<{
    branch?: { name: string };
    date?: string;
    stockSummary?: Array<{ quantity: number; item: { name: string; code: string } }>;
    attendance?: { totalEmployees: number; present: number; absent: number };
    notifications?: Array<{ title: string; body: string }>;
  } | null>(null);

  useEffect(() => {
    if (!branchId) return;
    void api.get(`/dashboard/sub${qs()}`).then((r) => setData(r.data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  if (!branchId) {
    return <div className="text-ice-600">Select a sub-branch workspace.</div>;
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ice-600">{t('common.loading')}</div>
    );
  }

  const stock = data.stockSummary || [];
  const att = data.attendance || { totalEmployees: 0, present: 0, absent: 0 };

  return (
    <div className="space-y-8">
      {isMainWorkspace && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Main Branch view — same workspace as this sub-branch admin uses.
        </div>
      )}
      <header className="relative overflow-hidden rounded-3xl border border-white/50 bg-gradient-to-br from-ice-900 via-ice-800 to-sky-700 p-6 text-white shadow-soft md:p-8">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl" />
        <div className="relative">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-200">IceFlow · Sub-branch</p>
          <h1 className="mt-1 font-display text-3xl font-semibold md:text-4xl">{data.branch?.name}</h1>
          <p className="mt-2 text-sky-100">
            {data.date &&
              new Date(data.date).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
          </p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total employees', value: att.totalEmployees, icon: Users, tone: 'from-sky-50 to-white' },
          { label: 'Present today', value: att.present, icon: UserCheck, tone: 'from-emerald-50 to-white' },
          { label: 'Absent today', value: att.absent, icon: UserX, tone: 'from-amber-50 to-white' },
        ].map((s) => (
          <div key={s.label} className={`card-panel bg-gradient-to-br ${s.tone} p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ice-500">{s.label}</div>
                <div className="mt-2 font-display text-4xl font-semibold text-ice-950">{s.value}</div>
              </div>
              <s.icon className="h-6 w-6 text-ice-400" />
            </div>
            <p className="mt-2 text-xs text-ice-500">Present = morning stock-out done</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-ice-700" />
          <h2 className="section-title">Current stock</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {stock.map((s, i) => (
            <div
              key={i}
              className="rounded-2xl border border-ice-100/80 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-ice-500">{s.item.code}</div>
              <div className="mt-1 text-sm font-semibold text-ice-900">{s.item.name}</div>
              <div className="mt-3 font-display text-3xl font-semibold text-ice-800">{s.quantity}</div>
            </div>
          ))}
          {stock.length === 0 && (
            <p className="col-span-full text-sm text-ice-500">No stock yet. Request stock from Main Branch.</p>
          )}
        </div>
      </section>

      {(data.notifications?.length || 0) > 0 && (
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">From Main Branch</h2>
          <div className="space-y-2">
            {data.notifications!.slice(0, 4).map((n, i) => (
              <div key={i} className="rounded-xl bg-ice-50 px-3 py-2 text-sm">
                <div className="font-semibold text-ice-900">{n.title}</div>
                <div className="text-ice-600">{n.body}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
