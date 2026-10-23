import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { useBranchScope } from '../../hooks/useBranchScope';

interface BoardItem {
  id: string;
  name: string;
  code: string;
  available: number;
  subToEmployeeRate?: number;
}

interface Line {
  itemId: string;
  stockOutQty: number;
  stockInQty: number;
  employeeRate: number;
  amount: number;
  item: { name: string; code: string };
}

interface BoardEmp {
  id: string;
  fullName: string;
  employeeCode: string;
  mobile: string;
  outstanding: number;
  session: null | {
    id: string;
    status: string;
    totalBill: number;
    cashPaid: number;
    phonePePaid: number;
    lines: Line[];
  };
  cashToCollect: number;
}

type Draft = {
  lines: Record<string, { out: number; inn: number; rate: number }>;
  phonePe: number;
  borrowEdit: string;
  editing: boolean;
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SubEmployeesBoard() {
  const { branchId, qs, isMainWorkspace, isMainBranchView } = useBranchScope();
  const [sessionDate, setSessionDate] = useState(todayLocal());
  const [employees, setEmployees] = useState<BoardEmp[]>([]);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [msg, setMsg] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ fullName: '', mobile: '', address: '' });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async (date = sessionDate) => {
    if (!branchId) return;
    const { data } = await api.get(`/employees/board/today${qs({ date })}`);
    const boardItems = data.data.items as BoardItem[];
    setEmployees(data.data.employees);
    setItems(boardItems);

    const next: Record<string, Draft> = {};
    for (const e of data.data.employees as BoardEmp[]) {
      const lines: Draft['lines'] = {};
      // Show EVERY item — fill from session or zeros
      for (const item of boardItems) {
        const existing = e.session?.lines?.find((l) => l.itemId === item.id);
        lines[item.id] = {
          out: existing?.stockOutQty ?? 0,
          inn: existing?.stockInQty ?? 0,
          rate: existing?.employeeRate ?? item.subToEmployeeRate ?? 0,
        };
      }
      const hasSaved =
        !!e.session && ['stock_out_saved', 'stock_in_draft', 'finalized'].includes(e.session.status);
      next[e.id] = {
        lines,
        phonePe: e.session?.phonePePaid ?? 0,
        borrowEdit: '',
        editing: !hasSaved || e.session?.status === 'draft',
      };
    }
    setDrafts(next);
  };

  useEffect(() => {
    void load(sessionDate);
  }, [sessionDate, branchId]);

  // Refresh when Ashok voice saves stock
  useEffect(() => {
    const onVoice = () => void load(sessionDate);
    window.addEventListener('iceflow:board-refresh', onVoice);
    return () => window.removeEventListener('iceflow:board-refresh', onVoice);
  }, [sessionDate, branchId]);

  const calc = (empId: string) => {
    const d = drafts[empId];
    if (!d) return { bill: 0, cashToCollect: 0 };
    let bill = 0;
    for (const item of items) {
      const v = d.lines[item.id];
      if (!v) continue;
      const sold = Math.max(0, v.out - v.inn);
      bill += sold * v.rate;
    }
    return { bill, cashToCollect: Math.max(0, bill - d.phonePe) };
  };

  const focusNext = (empId: string, itemIndex: number, field: 'out' | 'inn') => {
    // Enter moves DOWN the same column (Out→Out or In→In), then PhonePe
    const nextItem = items[itemIndex + 1];
    if (nextItem) {
      const key = `${empId}-${nextItem.id}-${field}`;
      inputRefs.current[key]?.focus();
      inputRefs.current[key]?.select();
      return;
    }
    if (field === 'out' && items[0]) {
      // Finished Out column → jump to first In
      const key = `${empId}-${items[0].id}-inn`;
      inputRefs.current[key]?.focus();
      inputRefs.current[key]?.select();
      return;
    }
    const phoneKey = `${empId}-phonepe`;
    inputRefs.current[phoneKey]?.focus();
    inputRefs.current[phoneKey]?.select();
  };

  const onEnter = (
    e: KeyboardEvent<HTMLInputElement>,
    empId: string,
    itemIndex: number,
    field: 'out' | 'inn'
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    focusNext(empId, itemIndex, field);
  };

  const setLine = (empId: string, itemId: string, patch: Partial<{ out: number; inn: number }>) => {
    setDrafts((p) => ({
      ...p,
      [empId]: {
        ...p[empId],
        lines: {
          ...p[empId].lines,
          [itemId]: { ...p[empId].lines[itemId], ...patch },
        },
      },
    }));
  };

  const ensureSession = async (employeeId: string) => {
    const { data } = await api.post('/sessions/open', { employeeId, sessionDate });
    return data.data.id as string;
  };

  const saveForDate = async (emp: BoardEmp) => {
    setMsg('');
    try {
      const d = drafts[emp.id];
      const sessionId = emp.session?.id || (await ensureSession(emp.id));
      const lineEntries = Object.entries(d.lines).filter(([, v]) => v.out > 0 || v.inn > 0);
      if (!lineEntries.length) {
        setMsg('Enter at least one Out quantity before saving');
        return;
      }
      await api.post(`/sessions/${sessionId}/stock-out`, {
        lines: lineEntries.map(([itemId, v]) => ({
          itemId,
          quantity: v.out,
          entrySource: 'manual',
        })),
      });
      await api.post(`/sessions/${sessionId}/stock-in`, {
        lines: lineEntries.map(([itemId, v]) => ({
          itemId,
          stockInQty: v.inn,
          entrySource: 'manual',
        })),
        payments: {
          cashPaid: Math.max(0, calc(emp.id).bill - d.phonePe),
          phonePePaid: d.phonePe,
        },
        finalize: false,
      });
      setMsg(`Saved for ${sessionDate} — ${emp.fullName}`);
      await load(sessionDate);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setMsg(e.response?.data?.error || 'Save failed');
    }
  };

  const finalizeCard = async (emp: BoardEmp) => {
    setMsg('');
    try {
      const d = drafts[emp.id];
      const sessionId = emp.session?.id || (await ensureSession(emp.id));
      const c = calc(emp.id);
      const lineEntries = Object.entries(d.lines).filter(([, v]) => v.out > 0);
      await api.post(`/sessions/${sessionId}/stock-out`, {
        lines: lineEntries.map(([itemId, v]) => ({ itemId, quantity: v.out, entrySource: 'manual' })),
      });
      await api.post(`/sessions/${sessionId}/stock-in`, {
        lines: lineEntries.map(([itemId, v]) => ({ itemId, stockInQty: v.inn, entrySource: 'manual' })),
        payments: { cashPaid: c.cashToCollect, phonePePaid: d.phonePe },
        finalize: true,
        confirmExcess: true,
      });
      setMsg(`Finalized ${emp.fullName} for ${sessionDate}`);
      await load(sessionDate);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setMsg(e.response?.data?.error || 'Finalize failed');
    }
  };

  const addBorrow = async (emp: BoardEmp) => {
    const add = Number(drafts[emp.id]?.borrowEdit || 0);
    if (add <= 0) {
      setMsg('Enter borrow amount');
      return;
    }
    await api.post(`/employees/${emp.id}/outstanding`, {
      amount: emp.outstanding + add,
      reason: `Borrowed ₹${add} on ${sessionDate}`,
    });
    setDrafts((p) => ({ ...p, [emp.id]: { ...p[emp.id], borrowEdit: '' } }));
    setMsg(`Borrowed ₹${add} recorded for ${emp.fullName}`);
    await load(sessionDate);
  };

  const clearBorrow = async (emp: BoardEmp) => {
    await api.post(`/employees/${emp.id}/outstanding`, {
      clear: true,
      reason: `Borrow cleared on ${sessionDate}`,
    });
    setMsg(`Borrow cleared for ${emp.fullName}`);
    await load(sessionDate);
  };

  const addEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!branchId) return;
    await api.post('/employees', { ...form, branchId });
    setShowAdd(false);
    setForm({ fullName: '', mobile: '', address: '' });
    await load(sessionDate);
  };

  const dateLabel = new Date(sessionDate + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (!branchId) {
    return <div className="text-ice-600">Select a sub-branch workspace.</div>;
  }

  return (
    <div className="space-y-5">
      {(isMainWorkspace || isMainBranchView) && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Viewing this sub-branch employee board from Main.
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="text-sm text-ice-600">
            All items listed · Enter moves down · Totals on the right · Ashok voice updates this board
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Working date</label>
            <input
              type="date"
              className="input !w-auto"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add employee
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-ice-50 px-4 py-2 text-sm text-ice-700">
        Showing entries for <strong>{dateLabel}</strong>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-ice-800">{msg}</div>}

      {showAdd && (
        <form onSubmit={(e) => void addEmployee(e)} className="card-panel grid gap-3 p-4 md:grid-cols-4">
          <input className="input" placeholder="Full name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className="input" placeholder="Mobile" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <input className="input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" type="submit">
              Save
            </button>
            <button className="btn-ghost" type="button" onClick={() => setShowAdd(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {employees.map((emp) => {
          const d = drafts[emp.id];
          if (!d) return null;
          const c = calc(emp.id);
          const finalized = emp.session?.status === 'finalized';
          const canEdit = d.editing && !finalized;
          const savedLocked = !d.editing && !finalized && !!emp.session;

          return (
            <article key={emp.id} className="rounded-2xl border border-ice-100 bg-white/90 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ice-950">{emp.fullName}</h2>
                  <p className="text-xs text-ice-500">
                    ID {emp.employeeCode} · {emp.mobile}
                    {finalized ? ' · Finalized' : savedLocked ? ' · Saved' : ' · Editing'}
                  </p>
                </div>
                {savedLocked && (
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !text-xs"
                    onClick={() => setDrafts((p) => ({ ...p, [emp.id]: { ...p[emp.id], editing: true } }))}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>

              <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/80 p-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                  Borrowed money (separate)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-violet-950">Now: ₹{emp.outstanding}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-24 rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm"
                    placeholder="Add ₹"
                    value={d.borrowEdit}
                    disabled={finalized}
                    onChange={(e) =>
                      setDrafts((p) => ({ ...p, [emp.id]: { ...p[emp.id], borrowEdit: e.target.value } }))
                    }
                  />
                  <button type="button" className="btn-ghost !px-2 !py-1 !text-[10px]" disabled={finalized} onClick={() => void addBorrow(emp)}>
                    Add borrow
                  </button>
                  <button
                    type="button"
                    className="btn-accent !px-2 !py-1 !text-[10px]"
                    disabled={finalized || emp.outstanding <= 0}
                    onClick={() => void clearBorrow(emp)}
                  >
                    Clear borrow
                  </button>
                </div>
              </div>

              {/* Table left + totals stacked on RIGHT */}
              <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                <div className="overflow-x-auto rounded-xl border border-ice-50">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ice-50 text-[10px] uppercase tracking-wide text-ice-500">
                      <tr>
                        <th className="px-2 py-1.5">Item</th>
                        <th className="px-2 py-1.5">Out</th>
                        <th className="px-2 py-1.5">In</th>
                        <th className="px-2 py-1.5">₹</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const v = d.lines[item.id] || { out: 0, inn: 0, rate: item.subToEmployeeRate || 0 };
                        const sold = Math.max(0, v.out - v.inn);
                        const amount = sold * v.rate;
                        return (
                          <tr key={item.id} className="border-t border-ice-50">
                            <td className="px-2 py-1.5 font-medium">
                              {item.name}
                              <div className="text-[10px] text-ice-400">avail {item.available}</div>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                ref={(el) => {
                                  inputRefs.current[`${emp.id}-${item.id}-out`] = el;
                                }}
                                type="number"
                                min={0}
                                className="w-14 rounded-lg border border-ice-100 px-1 py-1.5 text-center text-sm font-semibold disabled:bg-slate-50"
                                value={v.out || ''}
                                placeholder="0"
                                disabled={!canEdit}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setLine(emp.id, item.id, { out: Number(e.target.value) || 0 })}
                                onKeyDown={(e) => onEnter(e, emp.id, idx, 'out')}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                ref={(el) => {
                                  inputRefs.current[`${emp.id}-${item.id}-inn`] = el;
                                }}
                                type="number"
                                min={0}
                                className="w-14 rounded-lg border border-ice-100 px-1 py-1.5 text-center text-sm font-semibold disabled:bg-slate-50"
                                value={v.inn || ''}
                                placeholder="0"
                                disabled={!canEdit}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setLine(emp.id, item.id, { inn: Number(e.target.value) || 0 })}
                                onKeyDown={(e) => onEnter(e, emp.id, idx, 'inn')}
                              />
                            </td>
                            <td className="px-2 py-1.5 font-semibold">₹{amount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* RIGHT column: Grand total → PhonePe → Cash to collect */}
                <div className="flex flex-col gap-2">
                  <div className="rounded-xl bg-ice-800 px-3 py-3 text-white">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-200">Grand total</div>
                    <div className="font-display text-2xl font-semibold">₹{c.bill}</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-ice-500">PhonePe</label>
                    <input
                      ref={(el) => {
                        inputRefs.current[`${emp.id}-phonepe`] = el;
                      }}
                      type="number"
                      min={0}
                      className="input mt-0.5 !py-2 !text-base font-semibold"
                      value={d.phonePe || ''}
                      placeholder="0"
                      disabled={!canEdit}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        setDrafts((p) => ({
                          ...p,
                          [emp.id]: { ...p[emp.id], phonePe: Number(e.target.value) || 0 },
                        }))
                      }
                    />
                  </div>
                  <div className="rounded-xl bg-amber-50 px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Cash to collect
                    </div>
                    <div className="font-display text-2xl font-semibold text-amber-900">₹{c.cashToCollect}</div>
                  </div>
                </div>
              </div>

              {!finalized && canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={() => void saveForDate(emp)}>
                    <Save className="h-3.5 w-3.5" /> Save for {sessionDate}
                  </button>
                  <button type="button" className="btn-accent !py-1.5 !text-xs" onClick={() => void finalizeCard(emp)}>
                    Finalize day
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
