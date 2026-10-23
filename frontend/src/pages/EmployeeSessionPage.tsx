import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface ItemBal {
  itemId: string;
  quantity: number;
  item: { id: string; name: string; code: string };
}

interface SessionLine {
  itemId: string;
  stockOutQty: number;
  stockInQty: number;
  damagedQty: number;
  soldQty: number;
  employeeRate: number;
  amount: number;
  entrySource: string;
  item: { name: string; code: string };
}

interface Session {
  id: string;
  sessionNo: string;
  status: string;
  previousOutstanding: number;
  totalBill: number;
  cashPaid: number;
  phonePePaid: number;
  otherPaid: number;
  phonePeRef?: string;
  newOutstanding: number;
  excessAmount: number;
  lines: SessionLine[];
  employee: { fullName: string; employeeCode: string; outstanding: number };
}

export default function EmployeeSessionPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [balances, setBalances] = useState<ItemBal[]>([]);
  const [outQty, setOutQty] = useState<Record<string, number>>({});
  const [inQty, setInQty] = useState<Record<string, number>>({});
  const [dmgQty, setDmgQty] = useState<Record<string, number>>({});
  const [cashPaid, setCashPaid] = useState(0);
  const [phonePePaid, setPhonePePaid] = useState(0);
  const [otherPaid, setOtherPaid] = useState(0);
  const [phonePeRef, setPhonePeRef] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const firstInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data: open } = await api.post('/sessions/open', { employeeId: id });
    setSession(open.data);
    const lines = open.data.lines as SessionLine[];
    const o: Record<string, number> = {};
    const i: Record<string, number> = {};
    const d: Record<string, number> = {};
    for (const l of lines) {
      o[l.itemId] = l.stockOutQty;
      i[l.itemId] = l.stockInQty;
      d[l.itemId] = l.damagedQty;
    }
    setOutQty(o);
    setInQty(i);
    setDmgQty(d);
    setCashPaid(open.data.cashPaid);
    setPhonePePaid(open.data.phonePePaid);
    setOtherPaid(open.data.otherPaid);
    setPhonePeRef(open.data.phonePeRef || '');

    const { data: bal } = await api.get('/stock/balances');
    setBalances(
      (bal.data as Array<{ itemId?: string; item: { id: string; name: string; code: string }; quantity: number }>).map(
        (b) => ({
          itemId: b.item.id,
          quantity: b.quantity,
          item: b.item,
        })
      )
    );
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, [session?.id, balances.length]);

  const preview = useMemo(() => {
    if (!session) return null;
    let totalBill = 0;
    const rows = session.lines.length
      ? session.lines.map((l) => {
          const stockIn = inQty[l.itemId] ?? l.stockInQty;
          const sold = (outQty[l.itemId] ?? l.stockOutQty) - stockIn;
          const amount = sold * l.employeeRate;
          totalBill += amount;
          return { ...l, stockIn, sold, amount };
        })
      : [];
    // For morning: also show potential from balances not yet in lines
    const totalPaid = cashPaid + phonePePaid + otherPaid;
    const newOut = session.previousOutstanding + totalBill - totalPaid;
    const excess = newOut < 0 ? Math.abs(newOut) : 0;
    const cashToCollect = Math.max(0, totalBill - phonePePaid - otherPaid);
    return { rows, totalBill, totalPaid, newOut, excess, cashToCollect };
  }, [session, inQty, outQty, cashPaid, phonePePaid, otherPaid]);

  const onKeyNav = (e: React.KeyboardEvent<HTMLInputElement>, next?: HTMLInputElement | null) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      next?.focus();
      next?.select();
    }
  };

  const saveStockOut = async () => {
    if (!session) return;
    setError('');
    try {
      const lines = balances
        .map((b) => ({ itemId: b.itemId, quantity: outQty[b.itemId] || 0, entrySource: 'manual' as const }))
        .filter((l) => l.quantity > 0);
      const { data } = await api.post(`/sessions/${session.id}/stock-out`, { lines });
      setSession(data.data);
      setMessage('Morning stock-out saved successfully.');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed');
    }
  };

  const saveStockIn = async (finalize: boolean, confirmExcess = false) => {
    if (!session) return;
    setError('');
    try {
      const lines = session.lines.map((l) => ({
        itemId: l.itemId,
        stockInQty: inQty[l.itemId] ?? 0,
        damagedQty: dmgQty[l.itemId] ?? 0,
        entrySource: 'manual' as const,
      }));
      const { data } = await api.post(`/sessions/${session.id}/stock-in`, {
        lines,
        payments: { cashPaid, phonePePaid, otherPaid, phonePeRef },
        finalize,
        confirmExcess,
      });
      setSession(data.data);
      setMessage(finalize ? 'Day finalized.' : 'Draft saved.');
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { error?: string; code?: string; data?: { excessAmount: number } }; status?: number };
      };
      if (e.response?.data?.code === 'EXCESS_CONFIRM_REQUIRED') {
        const ok = window.confirm(
          `Excess Amount / Change to Return: ₹${e.response.data.data?.excessAmount}. Confirm credit handling?`
        );
        if (ok) await saveStockIn(finalize, true);
        return;
      }
      setError(e.response?.data?.error || 'Failed');
    }
  };

  const genPdf = async () => {
    if (!session) return;
    const { data } = await api.post(`/sessions/${session.id}/bill-pdf`);
    setMessage(`Bill PDF ready: ${data.data.filename}`);
  };

  if (!session) return <div>{t('common.loading')}</div>;

  const availableItems = balances.filter((b) => b.quantity > 0 || (outQty[b.itemId] || 0) > 0);
  const showEvening =
    ['stock_out_saved', 'stock_in_draft', 'finalized'].includes(session.status) || params.get('tab') === 'bill';

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="page-title">{session.employee.fullName}</h1>
        <p className="text-ice-600">
          {session.employee.employeeCode} · {session.sessionNo} · Status: {session.status}
        </p>
      </div>

      {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {/* Morning Stock-Out */}
      <section className="card-panel p-5">
        <h2 className="section-title mb-4">{t('session.stockOut')}</h2>
        <div className="space-y-3">
          {availableItems.map((b, idx) => (
            <div key={b.itemId} className="grid grid-cols-[1fr_120px_80px] items-center gap-3 md:grid-cols-[1fr_160px_100px]">
              <div>
                <div className="font-semibold text-ice-900">{b.item.name}</div>
                <div className="text-xs text-ice-500">Available: {b.quantity}</div>
              </div>
              <input
                ref={idx === 0 ? firstInputRef : undefined}
                className="input-lg"
                type="number"
                min={0}
                max={b.quantity + (outQty[b.itemId] || 0)}
                value={outQty[b.itemId] ?? ''}
                onChange={(e) => setOutQty({ ...outQty, [b.itemId]: Number(e.target.value) })}
                onKeyDown={(e) => {
                  const next = (e.currentTarget.parentElement?.parentElement?.children[idx + 1] as HTMLElement)
                    ?.querySelector('input') as HTMLInputElement | null;
                  onKeyNav(e, next);
                }}
                disabled={session.status === 'finalized'}
              />
              <span className="text-xs text-ice-500">pcs</span>
            </div>
          ))}
        </div>
        {session.status !== 'finalized' && (
          <button type="button" className="btn-primary mt-4" onClick={() => void saveStockOut()}>
            Save Morning Stock-Out
          </button>
        )}
      </section>

      {/* Evening */}
      {showEvening && (
        <section className="card-panel p-5 space-y-4">
          <h2 className="section-title">{t('session.stockIn')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-ice-100 text-xs uppercase tracking-wide text-ice-500">
                  <th className="py-2">Item</th>
                  <th>Out</th>
                  <th>In</th>
                  <th>Damaged</th>
                  <th>{t('session.sold')}</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((l) => {
                  const stockIn = inQty[l.itemId] ?? 0;
                  const sold = l.stockOutQty - stockIn;
                  const amount = sold * l.employeeRate;
                  return (
                    <tr key={l.itemId} className="border-b border-ice-50">
                      <td className="py-2 font-medium">{l.item.name}</td>
                      <td>{l.stockOutQty}</td>
                      <td>
                        <input
                          className="input-lg !py-2 !text-base w-24"
                          type="number"
                          min={0}
                          max={l.stockOutQty}
                          value={stockIn}
                          disabled={session.status === 'finalized'}
                          onChange={(e) => setInQty({ ...inQty, [l.itemId]: Number(e.target.value) })}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                      <td>
                        <input
                          className="input !py-2 w-20"
                          type="number"
                          min={0}
                          value={dmgQty[l.itemId] ?? 0}
                          disabled={session.status === 'finalized'}
                          onChange={(e) => setDmgQty({ ...dmgQty, [l.itemId]: Number(e.target.value) })}
                        />
                      </td>
                      <td className="font-semibold">{sold}</td>
                      <td>₹{l.employeeRate}</td>
                      <td className="font-semibold">₹{amount}</td>
                      <td className="text-xs capitalize text-ice-500">{l.entrySource}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preview && (
            <div className="grid gap-3 rounded-2xl bg-ice-50 p-4 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <div>Previous outstanding: ₹{session.previousOutstanding}</div>
                <div className="text-lg font-display font-semibold">
                  {t('session.totalBill')}: ₹{preview.totalBill}
                </div>
                <div>
                  {t('session.cashToCollect')}: ₹{preview.cashToCollect}
                </div>
              </div>
              <div className="grid gap-2">
                <div>
                  <label className="label">{t('session.phonePePaid')}</label>
                  <input
                    className="input-lg !text-left"
                    type="number"
                    min={0}
                    value={phonePePaid}
                    disabled={session.status === 'finalized'}
                    onChange={(e) => setPhonePePaid(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">PhonePe reference</label>
                  <input className="input" value={phonePeRef} disabled={session.status === 'finalized'} onChange={(e) => setPhonePeRef(e.target.value)} />
                </div>
                <div>
                  <label className="label">{t('session.cashPaid')}</label>
                  <input
                    className="input-lg !text-left"
                    type="number"
                    min={0}
                    value={cashPaid}
                    disabled={session.status === 'finalized'}
                    onChange={(e) => setCashPaid(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">Other payment</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={otherPaid}
                    disabled={session.status === 'finalized'}
                    onChange={(e) => setOtherPaid(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-4 text-sm">
                <div className="rounded-xl bg-white px-4 py-2 font-semibold">
                  {t('session.newOutstanding')}: ₹{preview.newOut < 0 ? 0 : preview.newOut}
                </div>
                {preview.excess > 0 && (
                  <div className="rounded-xl bg-amber-100 px-4 py-2 font-semibold text-amber-900">
                    {t('session.excess')}: ₹{preview.excess}
                  </div>
                )}
              </div>
            </div>
          )}

          {session.status !== 'finalized' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => void saveStockIn(false)}>
                {t('session.saveDraft')}
              </button>
              <button type="button" className="btn-primary" onClick={() => void saveStockIn(true)}>
                {t('session.finalize')}
              </button>
              {preview && preview.newOut === 0 && (
                <button type="button" className="btn-accent" onClick={() => void saveStockIn(true)}>
                  {t('session.markCleared')}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => void genPdf()}>
              {t('session.generatePdf')}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(
                    `IceFlow Bill for ${session.employee.fullName}: Total ₹${session.totalBill}, Outstanding ₹${session.newOutstanding}`
                  )}`
                )
              }
            >
              Send WhatsApp PDF
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                alert(
                  `SMS summary prepared:\n${session.employee.fullName} bill ₹${session.totalBill}, paid PhonePe ₹${phonePePaid}, cash ₹${cashPaid}`
                )
              }
            >
              Send SMS Summary
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
