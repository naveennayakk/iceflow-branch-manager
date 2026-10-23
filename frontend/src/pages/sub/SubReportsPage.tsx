import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useBranchScope } from '../../hooks/useBranchScope';

/** Distinct from Payments — profit & performance only */
export default function SubReportsPage() {
  const { branchId, qs, isMainWorkspace } = useBranchScope();
  const [profit, setProfit] = useState<Record<string, number> | null>(null);
  const [payments, setPayments] = useState<{ summary: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!branchId) return;
    void api.get(`/reports/profit${qs()}`).then((r) => setProfit(r.data.data));
    void api.get(`/reports/payments${qs()}`).then((r) => setPayments(r.data.data));
  }, [branchId, qs]);

  if (!branchId) return <div className="text-ice-600">Select a sub-branch workspace.</div>;

  return (
    <div className="space-y-6">
      {isMainWorkspace && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sub-branch reports from Main.
        </div>
      )}
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="text-sm text-ice-600">Profit and bill summary (not shown on home dashboard)</p>
      </div>

      {profit && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Gross collection', value: profit.grossCollection },
            { label: 'Stock cost', value: profit.stockCost },
            { label: 'Expenses', value: profit.expenses },
            { label: 'Approved losses', value: profit.approvedLosses },
            { label: 'Net profit', value: profit.netProfit },
          ].map((s) => (
            <div key={s.label} className="card-panel p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ice-500">{s.label}</div>
              <div className={`mt-1 font-display text-2xl font-semibold ${s.label === 'Net profit' ? 'text-emerald-700' : ''}`}>
                ₹{Number(s.value || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {payments && (
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Bill overview (selected period)</h2>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            {Object.entries(payments.summary).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-ice-50 px-3 py-2">
                <div className="text-xs uppercase text-ice-500">{k}</div>
                <div className="font-semibold">₹{Number(v).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
