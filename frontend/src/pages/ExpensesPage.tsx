import { FormEvent, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useBranchScope } from '../hooks/useBranchScope';

async function openReceipt(filename: string) {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`/uploads/${filename}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Could not open receipt');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

interface Branch {
  id: string;
  name: string;
  code: string;
  isMain?: boolean;
}

interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  description: string;
  expenseDate: string;
  status: string;
  receiptUrl?: string | null;
  receiptName?: string | null;
  reviewNote?: string | null;
  branch?: { id: string; name: string; code: string };
}

export default function ExpensesPage() {
  const user = useAuthStore((s) => s.user);
  const { branchId: scopeBranchId } = useBranchScope();
  const isMain = user?.role === 'MAIN_ADMIN';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    category: 'miscellaneous',
    amount: '',
    description: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    branchId: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    const q = new URLSearchParams();
    if (isMain && filterBranch) q.set('branchId', filterBranch);
    else if (!isMain && user?.branchId) q.set('branchId', user.branchId);
    else if (scopeBranchId) q.set('branchId', scopeBranchId);
    if (statusFilter) q.set('status', statusFilter);
    const url = q.toString() ? `/expenses?${q}` : '/expenses';
    const { data } = await api.get(url);
    setRows(data.data);
  };

  useEffect(() => {
    if (isMain) {
      void api.get('/branches').then((r) => {
        setBranches((r.data.data as Branch[]).filter((b) => !b.isMain));
      });
    }
  }, [isMain]);

  useEffect(() => {
    void load();
  }, [filterBranch, statusFilter, scopeBranchId, user?.branchId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    const fd = new FormData();
    fd.append('category', form.category);
    fd.append('amount', form.amount);
    fd.append('description', form.description);
    fd.append('expenseDate', form.expenseDate);
    const bid = isMain ? form.branchId || filterBranch || scopeBranchId : undefined;
    if (bid) fd.append('branchId', bid);
    if (file) fd.append('receipt', file);
    try {
      await api.post('/expenses', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm({ ...form, amount: '', description: '' });
      setFile(null);
      setMsg('Expense submitted — waiting for Main approval');
      await load();
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setMsg(er.response?.data?.error || 'Failed to submit expense');
    }
  };

  const review = async (id: string, status: 'approved' | 'rejected') => {
    const reviewNote = status === 'rejected' ? prompt('Reason for rejection?') || '' : '';
    await api.post(`/expenses/${id}/review`, { status, reviewNote });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Expenses{isMain ? ' — branch wise' : ''}</h1>
        <p className="text-sm text-ice-600">
          {isMain
            ? 'Review bills uploaded by sub-branches (photo or PDF). Only approved expenses count in profit.'
            : 'Add expense and upload bill photo/PDF for Main Branch approval.'}
        </p>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-ice-800">{msg}</div>}

      {isMain && (
        <div className="flex flex-wrap gap-3">
          <select className="input !w-auto" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className="input !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      )}

      <form onSubmit={(e) => void submit(e)} className="card-panel grid gap-3 p-5 md:grid-cols-3">
        {isMain && !scopeBranchId && (
          <select
            className="input"
            required
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
          >
            <option value="">Branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="input"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
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
          min={1}
          placeholder="Amount ₹"
          required
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          className="input"
          type="date"
          value={form.expenseDate}
          onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
        />
        <input
          className="input md:col-span-2"
          placeholder="Description"
          required
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div>
          <label className="label">Bill photo / PDF</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <button type="submit" className="btn-primary md:col-span-3">
          Submit expense for approval
        </button>
      </form>

      <div className="space-y-3">
        {rows.map((r) => {
          return (
            <article key={r.id} className="card-panel flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ice-950">
                  ₹{r.amount} · {r.category}
                  {r.branch && isMain ? ` · ${r.branch.name}` : ''}
                </div>
                <p className="text-sm text-ice-600">{r.description}</p>
                <p className="mt-1 text-xs text-ice-500">
                  {new Date(r.expenseDate).toLocaleDateString()} ·{' '}
                  <span
                    className={
                      r.status === 'approved'
                        ? 'font-semibold text-emerald-700'
                        : r.status === 'rejected'
                          ? 'font-semibold text-rose-700'
                          : 'font-semibold text-amber-700'
                    }
                  >
                    {r.status}
                  </span>
                  {r.reviewNote ? ` · ${r.reviewNote}` : ''}
                </p>
                {r.receiptUrl && (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-sky-700 hover:underline"
                    onClick={() => void openReceipt(r.receiptUrl!)}
                  >
                    View {r.receiptName || 'receipt'} →
                  </button>
                )}
              </div>
              {isMain && r.status === 'pending' && (
                <div className="flex gap-2">
                  <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={() => void review(r.id, 'approved')}>
                    Approve
                  </button>
                  <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={() => void review(r.id, 'rejected')}>
                    Reject
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!rows.length && <div className="text-sm text-ice-500">No expenses yet.</div>}
      </div>
    </div>
  );
}
