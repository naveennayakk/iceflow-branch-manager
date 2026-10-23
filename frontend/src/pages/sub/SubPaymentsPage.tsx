import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useBranchScope } from '../../hooks/useBranchScope';

export default function SubPaymentsPage() {
  const { branchId, qs, isMainWorkspace, basePath } = useBranchScope();
  const [daily, setDaily] = useState<
    Array<{ date: string; phonePe: number; cash: number; other: number; total: number; bills: number }>
  >([]);
  const [expenses, setExpenses] = useState<Array<Record<string, unknown>>>([]);
  const [totals, setTotals] = useState({
    phonePe: 0,
    cash: 0,
    expenses: 0,
    income: 0,
    grandTotal: 0,
  });
  const [expForm, setExpForm] = useState({
    category: 'miscellaneous',
    amount: '',
    description: '',
    expenseDate: new Date().toISOString().slice(0, 10),
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!branchId) return;
    const { data } = await api.get(`/reports/daily-income${qs({ days: '30' })}`);
    setDaily(data.data.daily);
    setExpenses(data.data.expenses);
    setTotals(data.data.totals);
  };

  useEffect(() => {
    void load();
  }, [branchId]);

  const addExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!branchId) return;
    setMsg('');
    const fd = new FormData();
    fd.append('category', expForm.category);
    fd.append('amount', expForm.amount);
    fd.append('description', expForm.description);
    fd.append('expenseDate', expForm.expenseDate);
    fd.append('branchId', branchId);
    if (receipt) fd.append('receipt', receipt);
    try {
      await api.post('/expenses', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setExpForm({ ...expForm, amount: '', description: '' });
      setReceipt(null);
      setMsg('Expense submitted for Main approval');
      await load();
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setMsg(er.response?.data?.error || 'Failed');
    }
  };

  if (!branchId) return <div className="text-ice-600">Select a sub-branch workspace.</div>;

  const cashToCollect = Math.max(0, (totals.grandTotal || 0) - (totals.phonePe || 0));

  return (
    <div className="space-y-6">
      {isMainWorkspace && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sub-branch payments view from Main.
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="text-sm text-ice-600">Daily income · Grand total / PhonePe / Cash to collect · Expenses with bill upload</p>
        </div>
        <Link to={`${basePath}/expenses`} className="btn-ghost !text-xs">
          All expenses →
        </Link>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2 text-sm">{msg}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-ice-800 p-4 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Grand total (30d)</div>
          <div className="font-display text-2xl font-semibold">₹{Number(totals.grandTotal || 0).toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">PhonePe</div>
          <div className="font-display text-2xl font-semibold text-sky-950">₹{Number(totals.phonePe).toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Cash to collect</div>
          <div className="font-display text-2xl font-semibold text-amber-950">₹{cashToCollect.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-rose-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Expenses (approved)</div>
          <div className="font-display text-2xl font-semibold text-rose-950">₹{Number(totals.expenses).toLocaleString()}</div>
        </div>
      </div>

      <section className="card-panel overflow-hidden">
        <div className="border-b border-ice-50 px-4 py-3">
          <h2 className="section-title">Daily income</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-ice-50 text-xs uppercase text-ice-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Grand total</th>
              <th className="px-4 py-2">PhonePe</th>
              <th className="px-4 py-2">Cash</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-t border-ice-50">
                <td className="px-4 py-2.5 font-medium">
                  {new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </td>
                <td className="px-4 py-2.5 font-semibold">₹{d.bills}</td>
                <td className="px-4 py-2.5">₹{d.phonePe}</td>
                <td className="px-4 py-2.5">₹{d.cash}</td>
              </tr>
            ))}
            {daily.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ice-400">
                  No collections yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={(e) => void addExpense(e)} className="card-panel space-y-3 p-5">
          <h2 className="section-title">Add expense + bill</h2>
          <select
            className="input"
            value={expForm.category}
            onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
          >
            {['maintenance', 'miscellaneous', 'utilities', 'transport', 'staff', 'other'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            placeholder="Amount"
            required
            value={expForm.amount}
            onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
          />
          <input
            className="input"
            placeholder="Description"
            required
            value={expForm.description}
            onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
          />
          <input
            className="input"
            type="date"
            value={expForm.expenseDate}
            onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })}
          />
          <div>
            <label className="label">Bill photo / PDF</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="block w-full text-sm"
              onChange={(e) => setReceipt(e.target.files?.[0] || null)}
            />
          </div>
          <button className="btn-primary" type="submit">
            Submit for Main approval
          </button>
        </form>

        <div className="card-panel p-5">
          <h2 className="section-title mb-3">Recent expenses</h2>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {expenses.map((ex) => (
              <div key={String(ex.id)} className="flex items-center justify-between rounded-xl bg-ice-50 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{String(ex.description)}</div>
                  <div className="text-xs capitalize text-ice-500">
                    {String(ex.category)} · {String(ex.status || 'pending')} ·{' '}
                    {new Date(String(ex.expenseDate)).toLocaleDateString()}
                  </div>
                </div>
                <div className="font-semibold text-rose-700">₹{String(ex.amount)}</div>
              </div>
            ))}
            {expenses.length === 0 && <p className="text-sm text-ice-400">No expenses yet</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
