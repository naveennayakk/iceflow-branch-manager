import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

interface BranchPay {
  branch: { id: string; name: string; code: string };
  grandTotal: number;
  phonePe: number;
  cashToCollect: number;
  cashCollected: number;
  sessionCount: number;
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MainPaymentsPage() {
  const [date, setDate] = useState(todayLocal());
  const [branches, setBranches] = useState<BranchPay[]>([]);
  const [totals, setTotals] = useState({
    grandTotal: 0,
    phonePe: 0,
    cashToCollect: 0,
    cashCollected: 0,
  });
  const [profit, setProfit] = useState<Record<string, number> | null>(null);

  const load = async () => {
    const [pay, prof] = await Promise.all([
      api.get(`/reports/payments-by-branch?from=${date}&to=${date}`),
      api.get('/reports/profit'),
    ]);
    setBranches(pay.data.data.branches);
    setTotals(pay.data.data.totals);
    setProfit(prof.data.data);
  };

  useEffect(() => {
    void load();
  }, [date]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Payments — branch wise</h1>
          <p className="text-sm text-ice-600">
            Sub collects from employees · Main sees Grand total, PhonePe, and Cash to collect per branch
          </p>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Grand total', value: totals.grandTotal, cls: 'bg-ice-800 text-white' },
          { label: 'PhonePe', value: totals.phonePe, cls: 'bg-sky-50 text-sky-950' },
          { label: 'Cash to collect', value: totals.cashToCollect, cls: 'bg-amber-50 text-amber-950' },
          { label: 'Cash recorded', value: totals.cashCollected, cls: 'bg-emerald-50 text-emerald-950' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.cls}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{s.label}</div>
            <div className="font-display text-2xl font-semibold">₹{Number(s.value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((b) => (
          <article key={b.branch.id} className="rounded-2xl border border-ice-100 bg-white/90 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-ice-950">{b.branch.name}</h2>
                <p className="text-xs text-ice-500">
                  {b.branch.code} · {b.sessionCount} session(s)
                </p>
              </div>
              <Link to={`/main/workspace/${b.branch.id}/payments`} className="btn-ghost !py-1 !text-xs">
                Open branch
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-ice-800 px-3 py-3 text-white">
                <div className="text-[10px] uppercase tracking-wide text-sky-200">Grand total</div>
                <div className="font-display text-xl font-semibold">₹{b.grandTotal}</div>
              </div>
              <div className="rounded-xl bg-sky-50 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-sky-700">PhonePe</div>
                <div className="font-display text-xl font-semibold text-sky-950">₹{b.phonePe}</div>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-amber-700">Cash to collect</div>
                <div className="font-display text-xl font-semibold text-amber-950">₹{b.cashToCollect}</div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {profit && (
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Profit (reports only — not on dashboard)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div>Gross: ₹{profit.grossCollection}</div>
            <div>Stock cost: ₹{profit.stockCost}</div>
            <div>Approved expenses: ₹{profit.expenses}</div>
            <div>Losses: ₹{profit.approvedLosses}</div>
            <div className="font-semibold">Net: ₹{profit.netProfit}</div>
          </div>
        </section>
      )}
    </div>
  );
}
