import { FormEvent, useEffect, useState } from 'react';
import api from '../../services/api';
import { Plus, Trash2 } from 'lucide-react';
import { useBranchScope } from '../../hooks/useBranchScope';

interface Item {
  id: string;
  name: string;
  subToEmployeeRate?: number;
}

export default function SubEventsPage() {
  const { branchId, qs, isMainWorkspace } = useBranchScope();
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    eventName: '',
    eventDate: '',
    customerName: '',
    customerPhone: '',
    customerPhone2: '',
    advancePaid: '',
    cashFixed: '',
    notes: '',
  });
  const [lines, setLines] = useState<Array<{ itemId: string; quantity: string; rate: string }>>([
    { itemId: '', quantity: '1', rate: '' },
  ]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!branchId) return;
    const [it, ev] = await Promise.all([api.get('/items'), api.get(`/events${qs()}`)]);
    setItems(it.data.data);
    setEvents(ev.data.data);
  };

  useEffect(() => {
    void load();
  }, [branchId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    if (!branchId) return;
    try {
      await api.post('/events', {
        eventName: form.eventName,
        eventDate: form.eventDate,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerPhone2: form.customerPhone2 || undefined,
        advancePaid: Number(form.advancePaid) || 0,
        cashFixed: Number(form.cashFixed) || 0,
        branchId,
        notes: form.notes || undefined,
        lines: lines
          .filter((l) => l.itemId && Number(l.quantity) > 0)
          .map((l) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
            rate: Number(l.rate) || 0,
          })),
      });
      setForm({
        eventName: '',
        eventDate: '',
        customerName: '',
        customerPhone: '',
        customerPhone2: '',
        advancePaid: '',
        cashFixed: '',
        notes: '',
      });
      setLines([{ itemId: '', quantity: '1', rate: '' }]);
      setMsg('Event saved');
      await load();
    } catch (err: unknown) {
      const er = err as { response?: { data?: { error?: string } } };
      setMsg(er.response?.data?.error || 'Failed');
    }
  };

  if (!branchId) return <div className="text-ice-600">Select a sub-branch workspace.</div>;

  return (
    <div className="space-y-6">
      {isMainWorkspace && (
        <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sub-branch events form from Main.
        </div>
      )}
      <div>
        <h1 className="page-title">Events</h1>
        <p className="text-sm text-ice-600">Book catering / bulk orders for this branch</p>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2 text-sm">{msg}</div>}

      <form onSubmit={(e) => void submit(e)} className="card-panel space-y-4 p-5 md:p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Event name *</label>
            <input className="input" required value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} />
          </div>
          <div>
            <label className="label">Date *</label>
            <input className="input" type="date" required value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Customer name</label>
            <input className="input" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </div>
          <div>
            <label className="label">Mobile number 1 *</label>
            <input className="input" required minLength={10} value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </div>
          <div>
            <label className="label">Mobile number 2 (optional)</label>
            <input className="input" value={form.customerPhone2} onChange={(e) => setForm({ ...form, customerPhone2: e.target.value })} />
          </div>
          <div>
            <label className="label">Cash paid advance</label>
            <input className="input" type="number" min={0} value={form.advancePaid} onChange={(e) => setForm({ ...form, advancePaid: e.target.value })} />
          </div>
          <div>
            <label className="label">Cash fixed (agreed total)</label>
            <input className="input" type="number" min={0} value={form.cashFixed} onChange={(e) => setForm({ ...form, cashFixed: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ice-800">Items</h3>
            <button
              type="button"
              className="btn-ghost !py-1 !text-xs"
              onClick={() => setLines([...lines, { itemId: '', quantity: '1', rate: '' }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1.4fr_0.6fr_0.6fr_auto]">
                <select
                  className="input"
                  value={line.itemId}
                  onChange={(e) => {
                    const item = items.find((i) => i.id === e.target.value);
                    const next = [...lines];
                    next[idx] = {
                      ...next[idx],
                      itemId: e.target.value,
                      rate: String(item?.subToEmployeeRate ?? next[idx].rate),
                    };
                    setLines(next);
                  }}
                >
                  <option value="">Item name</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...next[idx], quantity: e.target.value };
                    setLines(next);
                  }}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Rate"
                  value={line.rate}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...next[idx], rate: e.target.value };
                    setLines(next);
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost !px-2"
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button className="btn-primary" type="submit">
          Save event
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="section-title">Upcoming / recent</h2>
        {events.map((ev) => (
          <div key={String(ev.id)} className="card-panel p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-display text-lg font-semibold">{String(ev.eventName)}</div>
                <div className="text-ice-600">
                  {String(ev.customerName || '—')} · {String(ev.customerPhone)}
                  {ev.customerPhone2 ? ` / ${String(ev.customerPhone2)}` : ''}
                </div>
                <div className="text-xs text-ice-500">{new Date(String(ev.eventDate)).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">₹{String(ev.totalAmount)}</div>
                <div className="text-xs text-ice-500">Advance ₹{String(ev.advancePaid || 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
