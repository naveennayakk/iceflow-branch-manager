import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useBranchScope } from '../../hooks/useBranchScope';

interface ItemRow {
  id: string;
  name: string;
  code: string;
  packSize: number;
  packLabel: string;
  unit: string;
  mainToSubRate?: number;
}

export default function SubStockRequests() {
  const { branchId, qs, isMainWorkspace, user } = useBranchScope();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [boxes, setBoxes] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [requests, setRequests] = useState<Array<Record<string, unknown>>>([]);
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const notesRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    if (!branchId) return;
    const [it, req] = await Promise.all([api.get('/items'), api.get(`/stock/requests${qs()}`)]);
    setItems(it.data.data);
    setRequests(req.data.data);
  };

  useEffect(() => {
    void load();
  }, [branchId]);

  const onEnter = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = items[index + 1];
    if (next) {
      const el = inputRefs.current[next.id];
      el?.focus();
      el?.select();
      return;
    }
    notesRef.current?.focus();
  };

  const submit = async () => {
    setMsg('');
    if (!branchId) return;
    const lines = items
      .map((item) => {
        const boxCount = boxes[item.id] || 0;
        if (boxCount <= 0) return null;
        const pieces = boxCount * (item.packSize || 1);
        return { itemId: item.id, quantityAsked: pieces };
      })
      .filter(Boolean) as Array<{ itemId: string; quantityAsked: number }>;

    if (!lines.length) {
      setMsg('Enter at least one box/pack quantity');
      return;
    }
    await api.post('/stock/requests', {
      notes,
      lines,
      ...(user?.role === 'MAIN_ADMIN' ? { branchId } : {}),
    });
    setBoxes({});
    setNotes('');
    setMsg('Stock request sent to Main Branch');
    await load();
  };

  if (!branchId) return <div className="text-ice-600">Select a sub-branch workspace.</div>;

  return (
    <div className="space-y-6">
      {isMainWorkspace && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sub-branch stock request form (same as branch admin).
        </div>
      )}
      <div>
        <h1 className="page-title">Stock request</h1>
        <p className="text-sm text-ice-600">
          Enter boxes/packs · Press Enter for next item · Click a request/dispatch to see amounts
        </p>
      </div>

      {msg && <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</div>}

      <div className="card-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-ice-50 text-xs uppercase tracking-wide text-ice-500">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Pack size</th>
              <th className="px-4 py-3">Boxes / packs</th>
              <th className="px-4 py-3">Total pieces</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pack = item.packSize || 1;
              const boxCount = boxes[item.id] || 0;
              return (
                <tr key={item.id} className="border-t border-ice-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ice-900">{item.name}</div>
                    <div className="text-xs text-ice-500">{item.code}</div>
                  </td>
                  <td className="px-4 py-3 text-ice-700">
                    {pack} / {item.packLabel || 'box'}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      ref={(el) => {
                        inputRefs.current[item.id] = el;
                      }}
                      type="number"
                      min={0}
                      className="input-lg !w-28 !py-2 !text-base"
                      value={boxCount || ''}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setBoxes({ ...boxes, [item.id]: Number(e.target.value) || 0 })}
                      onKeyDown={(e) => onEnter(e, idx)}
                    />
                  </td>
                  <td className="px-4 py-3 font-display text-xl font-semibold text-ice-800">{boxCount * pack}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="label">Notes (optional)</label>
          <input
            ref={notesRef}
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Need by Friday morning…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => void submit()}>
          Send request
        </button>
      </div>

      <section>
        <h2 className="section-title mb-3">Your recent requests / dispatches</h2>
        <div className="space-y-2">
          {requests.map((r) => {
            const id = String(r.id);
            const open = openId === id;
            const lines =
              (r.lines as Array<{
                id: string;
                quantityAsked: number;
                quantityApproved?: number | null;
                boxesAsked?: number;
                item: { name: string; packSize?: number; packLabel?: string; id?: string };
              }>) || [];
            const dispatch = r.dispatch as
              | {
                  dispatchNo: string;
                  status: string;
                  totalAmount?: number;
                  lines?: Array<{
                    id: string;
                    quantity: number;
                    costRate: number;
                    amount: number;
                    boxes?: number;
                    item: { name: string; packLabel?: string };
                  }>;
                }
              | null
              | undefined;

            // Estimate request amount using Main→Sub rates from catalog
            const estAmount = lines.reduce((sum, l) => {
              const cat = items.find((i) => i.id === l.item.id || i.name === l.item.name);
              const rate = cat?.mainToSubRate ?? 0;
              return sum + l.quantityAsked * rate;
            }, 0);

            return (
              <div key={id} className="card-panel overflow-hidden p-0 text-sm">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-ice-50"
                  onClick={() => setOpenId(open ? null : id)}
                >
                  <div>
                    <div className="font-semibold">{String(r.requestNo)}</div>
                    <div className="text-xs text-ice-500">
                      {new Date(String(r.createdAt)).toLocaleString()}
                      {estAmount > 0 ? ` · est. ₹${estAmount.toLocaleString()}` : ''}
                      {dispatch ? ` · DSP ${dispatch.dispatchNo} ₹${Number(dispatch.totalAmount || 0).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-ice-100 px-3 py-1 text-xs font-semibold capitalize text-ice-800">
                      {String(r.status)}
                    </span>
                    <span className="text-xs text-ice-500">{open ? 'Hide ▲' : 'Details ▼'}</span>
                  </div>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-ice-50 bg-ice-50/40 px-4 py-3">
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ice-500">
                        You requested
                      </div>
                      <ul className="space-y-1 text-xs">
                        {lines.map((l) => {
                          const pack = l.item.packSize || 1;
                          const box =
                            l.boxesAsked ??
                            (pack > 0 ? Math.round((l.quantityAsked / pack) * 100) / 100 : l.quantityAsked);
                          const cat = items.find((i) => i.name === l.item.name);
                          const rate = cat?.mainToSubRate ?? 0;
                          const amt = l.quantityAsked * rate;
                          return (
                            <li key={l.id} className="flex flex-wrap justify-between gap-2">
                              <span>
                                {l.item.name}: <strong>{box}</strong> {l.item.packLabel || 'box'} ({l.quantityAsked}{' '}
                                pcs)
                                {l.quantityApproved != null ? ` · approved ${l.quantityApproved} pcs` : ''}
                              </span>
                              {rate > 0 && <span className="font-semibold">₹{amt.toLocaleString()}</span>}
                            </li>
                          );
                        })}
                      </ul>
                      {estAmount > 0 && (
                        <div className="mt-2 text-sm font-semibold text-ice-900">
                          Request estimate (Main→Sub): ₹{estAmount.toLocaleString()}
                        </div>
                      )}
                      {r.notes ? <p className="mt-1 text-xs text-ice-600">Note: {String(r.notes)}</p> : null}
                    </div>

                    {dispatch && (
                      <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          Dispatch output · {dispatch.dispatchNo} · {dispatch.status}
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-sky-700">
                              <th className="py-1">Item</th>
                              <th>Boxes</th>
                              <th>Pcs</th>
                              <th>Rate</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dispatch.lines || []).map((l) => (
                              <tr key={l.id} className="border-t border-sky-100">
                                <td className="py-1.5 font-medium">{l.item.name}</td>
                                <td>
                                  {l.boxes ?? '—'} {l.item.packLabel || 'box'}
                                </td>
                                <td>{l.quantity}</td>
                                <td>₹{l.costRate}</td>
                                <td className="font-semibold">₹{Number(l.amount).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-sky-200 font-semibold">
                              <td className="py-2" colSpan={4}>
                                Dispatch total
                              </td>
                              <td>₹{Number(dispatch.totalAmount || 0).toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {requests.length === 0 && <p className="text-sm text-ice-400">No requests yet</p>}
        </div>
      </section>
    </div>
  );
}
