import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useBranchScope } from '../hooks/useBranchScope';

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="page-title">{title}</h1>
      {children}
    </div>
  );
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
    adminUsername: '',
    city: '',
  });
  const [createdCreds, setCreatedCreds] = useState<{ username: string; temporaryPassword: string } | null>(null);

  const load = () => void api.get('/branches').then((r) => setBranches(r.data.data));
  useEffect(() => {
    load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { data } = await api.post('/branches', form);
    setCreatedCreds({ username: data.data.username, temporaryPassword: data.data.temporaryPassword });
    setForm({ code: '', name: '', adminUsername: '', city: '' });
    load();
  };

  return (
    <PageShell title="Sub-branch Management">
      <form onSubmit={(e) => void create(e)} className="card-panel grid gap-3 p-5 md:grid-cols-4">
        <input className="input" placeholder="Code e.g. BR009" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input" placeholder="Admin username" value={form.adminUsername} onChange={(e) => setForm({ ...form, adminUsername: e.target.value })} required />
        <button className="btn-primary" type="submit">
          Create branch
        </button>
      </form>
      {createdCreds && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm">
          Temporary login: <strong>{createdCreds.username}</strong> / <strong>{createdCreds.temporaryPassword}</strong>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {branches.map((b) => (
          <div key={String(b.id)} className="card-panel p-4">
            <div className="font-display text-xl font-semibold">{String(b.name)}</div>
            <div className="text-sm text-ice-600">
              {String(b.code)} · {b.isActive ? 'Active' : 'Inactive'} {b.isLocked ? '· Locked' : ''}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/main/workspace/${b.id}`} className="btn-primary !text-xs">
                Open workspace
              </Link>
              <button
                type="button"
                className="btn-ghost !text-xs"
                onClick={() =>
                  void api.patch(`/branches/${b.id}`, {
                    isLocked: !b.isLocked,
                    reason: 'Toggle lock from UI',
                  }).then(load)
                }
              >
                {b.isLocked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                className="btn-ghost !text-xs"
                onClick={async () => {
                  const reason = prompt('Reason for password reset?');
                  if (!reason) return;
                  const { data } = await api.post('/auth/reset-sub-password', { branchId: b.id, reason });
                  alert(`New temp password: ${data.data.temporaryPassword}`);
                }}
              >
                Reset password
              </button>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function ItemsPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    code: '',
    name: '',
    mainToSubRate: 0,
    subToEmployeeRate: 0,
    packSize: 24,
    packLabel: 'box',
  });
  const load = () => void api.get('/items').then((r) => setItems(r.data.data));
  useEffect(() => {
    load();
  }, []);

  return (
    <PageShell title="Item Master, Rates & Pack sizes">
      <p className="mb-3 text-sm text-ice-600">
        Pack size = pieces per box (e.g. Cups 24, Candy 50). Sub-branches order by boxes; Main can change pack size anytime.
      </p>
      <form
        className="card-panel grid gap-3 p-5 md:grid-cols-4 lg:grid-cols-7"
        onSubmit={(e) => {
          e.preventDefault();
          void api.post('/items', { ...form, reason: 'Catalog add' }).then(load);
        }}
      >
        <input className="input" placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input" type="number" placeholder="Main→Sub rate" value={form.mainToSubRate} onChange={(e) => setForm({ ...form, mainToSubRate: Number(e.target.value) })} />
        <input className="input" type="number" placeholder="Sub→Emp rate" value={form.subToEmployeeRate} onChange={(e) => setForm({ ...form, subToEmployeeRate: Number(e.target.value) })} />
        <input className="input" type="number" min={1} placeholder="Pack size" value={form.packSize} onChange={(e) => setForm({ ...form, packSize: Number(e.target.value) })} />
        <input className="input" placeholder="Pack label" value={form.packLabel} onChange={(e) => setForm({ ...form, packLabel: e.target.value })} />
        <button className="btn-primary" type="submit">
          Add item
        </button>
      </form>
      <div className="card-panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ice-100 text-xs uppercase text-ice-500">
              <th className="p-3">Code</th>
              <th>Name</th>
              <th>Pack</th>
              <th>Main→Sub</th>
              <th>Sub→Emp</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={String(it.id)} className="border-b border-ice-50">
                <td className="p-3 font-mono text-xs">{String(it.code)}</td>
                <td>{String(it.name)}</td>
                <td className="font-semibold">
                  {String(it.packSize || 1)} / {String(it.packLabel || 'box')}
                </td>
                <td>₹{String(it.mainToSubRate)}</td>
                <td>₹{String(it.subToEmployeeRate)}</td>
                <td>{it.isActive ? 'Active' : 'Inactive'}</td>
                <td className="space-x-2 p-2">
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={async () => {
                      const packSize = Number(prompt('Pieces per pack/box?', String(it.packSize || 1)));
                      if (!packSize || packSize < 1) return;
                      const packLabel = prompt('Pack label (box/packet)?', String(it.packLabel || 'box')) || 'box';
                      await api.patch(`/items/${it.id}`, { packSize, packLabel, reason: 'Pack size update' });
                      load();
                    }}
                  >
                    Edit pack
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={async () => {
                      const amount = Number(prompt('New Sub→Employee rate?'));
                      const reason = prompt('Reason?');
                      if (!amount || !reason) return;
                      await api.post(`/items/${it.id}/rates`, {
                        rateType: 'SUB_TO_EMPLOYEE',
                        amount,
                        reason,
                      });
                      load();
                    }}
                  >
                    Emp rate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

export function StockPage() {
  const user = useAuthStore((s) => s.user);
  const { branchId: scopeBranchId, qs, isMainWorkspace } = useBranchScope();
  const [balances, setBalances] = useState<Array<Record<string, unknown>>>([]);
  const [dispatches, setDispatches] = useState<Array<Record<string, unknown>>>([]);
  const [damage, setDamage] = useState<Array<Record<string, unknown>>>([]);
  const [branches, setBranches] = useState<Array<Record<string, unknown>>>([]);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [dispatchForm, setDispatchForm] = useState({ toBranchId: '', itemId: '', quantity: 0 });
  const [openDispatchId, setOpenDispatchId] = useState<string | null>(null);

  const load = async () => {
    const branchesRes =
      user?.role === 'MAIN_ADMIN' && !isMainWorkspace
        ? await api.get('/branches')
        : { data: { data: [] as Array<Record<string, unknown>> } };

    let balanceUrl = '/stock/balances';
    if (user?.role === 'SUB_ADMIN') {
      balanceUrl = '/stock/balances';
    } else if (scopeBranchId) {
      balanceUrl = `/stock/balances${qs()}`;
    } else if (user?.role === 'MAIN_ADMIN' && branchesRes.data.data[0]) {
      balanceUrl = `/stock/balances?branchId=${branchesRes.data.data[0].id}`;
    }

    const [b, d, dm, it] = await Promise.all([
      api.get(balanceUrl),
      api.get('/stock/dispatches'),
      api.get('/stock/damage'),
      api.get('/items'),
    ]);
    setBalances(b.data.data);
    setDispatches(d.data.data);
    setDamage(dm.data.data);
    setBranches(branchesRes.data.data);
    setItems(it.data.data);
  };
  useEffect(() => {
    void load();
  }, [scopeBranchId, isMainWorkspace]);

  return (
    <PageShell title="Stock">
      {isMainWorkspace && (
        <div className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sub-branch stock view from Main.
        </div>
      )}
      {user?.role === 'MAIN_ADMIN' && !isMainWorkspace && (
        <form
          className="card-panel grid gap-3 p-5 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void api
              .post('/stock/dispatches', {
                toBranchId: dispatchForm.toBranchId,
                lines: [{ itemId: dispatchForm.itemId, quantity: dispatchForm.quantity }],
              })
              .then(load);
          }}
        >
          <select className="input" value={dispatchForm.toBranchId} onChange={(e) => setDispatchForm({ ...dispatchForm, toBranchId: e.target.value })} required>
            <option value="">To branch</option>
            {branches.map((b) => (
              <option key={String(b.id)} value={String(b.id)}>
                {String(b.name)}
              </option>
            ))}
          </select>
          <select className="input" value={dispatchForm.itemId} onChange={(e) => setDispatchForm({ ...dispatchForm, itemId: e.target.value })} required>
            <option value="">Item</option>
            {items.map((i) => (
              <option key={String(i.id)} value={String(i.id)}>
                {String(i.name)}
              </option>
            ))}
          </select>
          <input className="input" type="number" placeholder="Qty" value={dispatchForm.quantity || ''} onChange={(e) => setDispatchForm({ ...dispatchForm, quantity: Number(e.target.value) })} />
          <button className="btn-primary" type="submit">
            Create dispatch
          </button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Balances</h2>
          <div className="space-y-2 text-sm">
            {balances.map((b, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-ice-50 px-3 py-2">
                <span>{(b.item as { name: string }).name}</span>
                <span className="font-semibold">{String(b.quantity)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Dispatches</h2>
          <p className="mb-3 text-xs text-ice-500">Click a dispatch to see requested items, quantities, rates and amount</p>
          <div className="space-y-2 text-sm">
            {dispatches.map((d) => {
              const id = String(d.id);
              const open = openDispatchId === id;
              const toBranch = d.toBranch as { name?: string } | undefined;
              const fromBranch = d.fromBranch as { name?: string } | undefined;
              const lines = (d.lines as Array<{
                id: string;
                quantity: number;
                costRate: number;
                amount: number;
                boxes?: number;
                item: { name: string; packSize?: number; packLabel?: string; code?: string };
              }>) || [];
              const request = d.request as
                | {
                    requestNo?: string;
                    notes?: string;
                    lines?: Array<{
                      id: string;
                      quantityAsked: number;
                      quantityApproved?: number | null;
                      item: { name: string; packSize?: number; packLabel?: string };
                    }>;
                  }
                | null
                | undefined;
              const totalAmount = Number(d.totalAmount ?? lines.reduce((s, l) => s + (l.amount ?? l.quantity * l.costRate), 0));

              return (
                <div key={id} className="rounded-xl border border-ice-100 overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-ice-50"
                    onClick={() => setOpenDispatchId(open ? null : id)}
                  >
                    <div>
                      <div className="font-semibold text-ice-950">
                        {String(d.dispatchNo)} · <span className="capitalize">{String(d.status)}</span>
                      </div>
                      <div className="text-xs text-ice-500">
                        {(fromBranch?.name || 'Main') + ' → ' + (toBranch?.name || 'Branch')}
                        {' · '}
                        ₹{totalAmount.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-ice-600">{open ? 'Hide ▲' : 'Details ▼'}</span>
                  </button>

                  {open && (
                    <div className="border-t border-ice-50 bg-ice-50/50 px-3 py-3 space-y-3">
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ice-500">
                          Dispatched items (amount = qty × Main→Sub rate)
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead className="text-ice-500">
                            <tr>
                              <th className="py-1 pr-2">Item</th>
                              <th className="py-1 pr-2">Boxes</th>
                              <th className="py-1 pr-2">Pcs</th>
                              <th className="py-1 pr-2">Rate</th>
                              <th className="py-1">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l) => (
                              <tr key={l.id} className="border-t border-ice-100">
                                <td className="py-1.5 pr-2 font-medium">{l.item.name}</td>
                                <td className="py-1.5 pr-2">
                                  {l.boxes ?? '—'} {l.item.packLabel || 'box'}
                                </td>
                                <td className="py-1.5 pr-2">{l.quantity}</td>
                                <td className="py-1.5 pr-2">₹{l.costRate}</td>
                                <td className="py-1.5 font-semibold">₹{(l.amount ?? l.quantity * l.costRate).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-ice-200 font-semibold">
                              <td className="py-2" colSpan={4}>
                                Grand total
                              </td>
                              <td className="py-2">₹{totalAmount.toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {request && (
                        <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2.5">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Original request {request.requestNo || ''}
                          </div>
                          {request.notes && <p className="mb-1 text-xs text-amber-900">{request.notes}</p>}
                          <ul className="space-y-1 text-xs text-amber-950">
                            {(request.lines || []).map((rl) => {
                              const pack = rl.item.packSize || 1;
                              const boxes = pack > 0 ? Math.round((rl.quantityAsked / pack) * 100) / 100 : rl.quantityAsked;
                              return (
                                <li key={rl.id}>
                                  {rl.item.name}: asked <strong>{boxes}</strong> {rl.item.packLabel || 'box'} (
                                  {rl.quantityAsked} pcs)
                                  {rl.quantityApproved != null ? ` · approved ${rl.quantityApproved} pcs` : ''}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {user?.role === 'MAIN_ADMIN' && d.status === 'approved' && (
                          <button
                            type="button"
                            className="btn-ghost !text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void api.post(`/stock/dispatches/${id}/status`, { status: 'packed' }).then(load);
                            }}
                          >
                            Pack
                          </button>
                        )}
                        {user?.role === 'MAIN_ADMIN' && ['approved', 'packed'].includes(String(d.status)) && (
                          <button
                            type="button"
                            className="btn-primary !text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void api.post(`/stock/dispatches/${id}/status`, { status: 'sent' }).then(load);
                            }}
                          >
                            Mark Sent
                          </button>
                        )}
                        {(user?.role === 'SUB_ADMIN' || isMainWorkspace) && d.status === 'sent' && (
                          <button
                            type="button"
                            className="btn-primary !text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void api.post(`/stock/dispatches/${id}/status`, { status: 'received' }).then(load);
                            }}
                          >
                            Confirm Received
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {dispatches.length === 0 && <p className="text-ice-400">No dispatches yet</p>}
          </div>
        </section>
      </div>

      <section className="card-panel p-5">
        <h2 className="section-title mb-3">Damage / Write-off</h2>
        {user?.role === 'SUB_ADMIN' && (
          <form
            className="mb-4 grid gap-2 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void api
                .post('/stock/damage', {
                  itemId: fd.get('itemId'),
                  quantity: Number(fd.get('quantity')),
                  reason: fd.get('reason'),
                })
                .then(load);
            }}
          >
            <select name="itemId" className="input" required>
              {items.map((i) => (
                <option key={String(i.id)} value={String(i.id)}>
                  {String(i.name)}
                </option>
              ))}
            </select>
            <input name="quantity" className="input" type="number" placeholder="Qty" required />
            <input name="reason" className="input" placeholder="Reason" required />
            <button className="btn-primary" type="submit">
              Report damage
            </button>
          </form>
        )}
        <div className="space-y-2 text-sm">
          {damage.map((d) => (
            <div key={String(d.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ice-50 px-3 py-2">
              <span>
                {(d.item as { name: string })?.name} · {String(d.quantity)} · {String(d.status)}
              </span>
              {user?.role === 'MAIN_ADMIN' && d.status === 'pending' && (
                <div className="flex gap-2">
                  <button type="button" className="btn-primary !text-xs" onClick={() => void api.post(`/stock/damage/${d.id}/review`, { status: 'approved' }).then(load)}>
                    Approve
                  </button>
                  <button type="button" className="btn-ghost !text-xs" onClick={() => void api.post(`/stock/damage/${d.id}/review`, { status: 'rejected' }).then(load)}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

export function RequestsPage() {
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<Array<Record<string, unknown>>>([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [branches, setBranches] = useState<Array<{ id: string; name: string; isMain?: boolean }>>([]);
  const load = async () => {
    const url = filterBranch ? `/stock/requests?branchId=${filterBranch}` : '/stock/requests';
    const r = await api.get(url);
    setRequests(r.data.data);
  };
  useEffect(() => {
    if (user?.role === 'MAIN_ADMIN') {
      void api.get('/branches').then((r) =>
        setBranches((r.data.data as Array<{ id: string; name: string; isMain?: boolean }>).filter((b) => !b.isMain))
      );
    }
  }, [user?.role]);
  useEffect(() => {
    void load();
  }, [filterBranch]);

  return (
    <PageShell title="Stock Requests">
      <p className="mb-3 text-sm text-ice-600">
        Quantities are in pieces. Pack sizes (Cups 24, Candy 50, etc.) are set under Items — change there when packs change.
      </p>
      {user?.role === 'MAIN_ADMIN' && (
        <select className="input mb-4 !w-auto" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <div className="space-y-3">
        {requests.map((r) => {
          const branch = r.branch as { name?: string } | undefined;
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
          return (
            <div key={String(r.id)} className="card-panel p-4">
              <div className="font-semibold">
                {String(r.requestNo)} · {String(r.status)}
                {branch?.name ? ` · ${branch.name}` : ''}
                {dispatch ? ` · DSP ${dispatch.dispatchNo} ₹${Number(dispatch.totalAmount || 0).toLocaleString()}` : ''}
              </div>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-ice-500">Requested</div>
              <ul className="mt-1 text-sm text-ice-700">
                {(
                  (r.lines as Array<{
                    item: { name: string; packSize?: number; packLabel?: string };
                    quantityAsked: number;
                    quantityApproved?: number | null;
                    id: string;
                  }>) || []
                ).map((l) => {
                  const pack = l.item.packSize || 1;
                  const boxes = pack > 0 ? Math.round((l.quantityAsked / pack) * 100) / 100 : l.quantityAsked;
                  return (
                    <li key={l.id}>
                      {l.item.name}: <strong>{boxes}</strong> {l.item.packLabel || 'box'}(s) = {l.quantityAsked} pcs
                      {l.quantityApproved != null ? ` · approved ${l.quantityApproved} pcs` : ''}
                    </li>
                  );
                })}
              </ul>
              {dispatch && (
                <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-800">
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
                          Total amount
                        </td>
                        <td>₹{Number(dispatch.totalAmount || 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {user?.role === 'MAIN_ADMIN' && r.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary !text-xs"
                    onClick={() =>
                      void api
                        .post(`/stock/requests/${r.id}/review`, {
                          status: 'approved',
                          createDispatch: true,
                          lines: ((r.lines as Array<{ id: string; quantityAsked: number }>) || []).map((l) => ({
                            id: l.id,
                            quantityApproved: l.quantityAsked,
                          })),
                        })
                        .then(load)
                    }
                  >
                    Approve + Dispatch
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={() => void api.post(`/stock/requests/${r.id}/review`, { status: 'rejected' }).then(load)}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

/** @deprecated use MainPaymentsPage — kept for reports route */
export function PaymentsReportsPage() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<{ summary: Record<string, number>; sessions: unknown[] } | null>(null);
  const [profit, setProfit] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    void api.get('/reports/payments').then((r) => setPayments(r.data.data));
    void api.get('/reports/profit').then((r) => setProfit(r.data.data));
  }, []);
  return (
    <PageShell title={`${t('nav.payments')} / ${t('nav.reports')}`}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {payments &&
          ['grandTotal', 'phonePe', 'cashToCollect', 'grossCollection']
            .filter((k) => payments.summary[k] != null)
            .map((k) => (
              <div key={k} className="card-panel p-4">
                <div className="text-xs uppercase text-ice-500">{k}</div>
                <div className="font-display text-2xl font-semibold">₹{Number(payments.summary[k]).toLocaleString()}</div>
              </div>
            ))}
      </div>
      {profit && (
        <section className="card-panel p-5">
          <h2 className="section-title mb-3">Profit (not shown on home dashboard)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div>Gross: ₹{profit.grossCollection}</div>
            <div>Stock cost: ₹{profit.stockCost}</div>
            <div>Expenses: ₹{profit.expenses}</div>
            <div>Losses: ₹{profit.approvedLosses}</div>
            <div className="font-semibold">Net: ₹{profit.netProfit}</div>
          </div>
        </section>
      )}
    </PageShell>
  );
}

export function EventsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const load = () => void api.get('/events').then((r) => setRows(r.data.data));
  useEffect(() => {
    load();
  }, []);
  return (
    <PageShell title="Event Orders">
      <form
        className="card-panel grid gap-3 p-5 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void api
            .post('/events', {
              eventName: fd.get('eventName'),
              customerName: fd.get('customerName'),
              eventDate: fd.get('eventDate'),
            })
            .then(load);
        }}
      >
        <input name="eventName" className="input" placeholder="Event name" required />
        <input name="customerName" className="input" placeholder="Customer" />
        <input name="eventDate" className="input" type="date" required />
        <button className="btn-primary" type="submit">
          Add event
        </button>
      </form>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={String(r.id)} className="card-panel p-4 text-sm">
            <div className="font-semibold">{String(r.eventName)}</div>
            <div className="text-ice-600">
              {String(r.customerName || '')} · {new Date(String(r.eventDate)).toLocaleDateString()} · {String(r.status)}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function NotificationsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    void api.get('/notifications').then((r) => setRows(r.data.data));
  }, []);
  return (
    <PageShell title="Notification Center">
      <div className="space-y-2">
        {rows.map((n) => (
          <div key={String(n.id)} className="card-panel p-4 text-sm">
            <div className="font-semibold">{String(n.title)}</div>
            <div className="text-ice-600">{String(n.body)}</div>
            {!n.isRead && (
              <button type="button" className="btn-ghost mt-2 !text-xs" onClick={() => void api.post(`/notifications/${n.id}/read`)}>
                Mark read
              </button>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function AuditPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    void api.get('/audit').then((r) => setRows(r.data.data));
  }, []);
  return (
    <PageShell title="Audit Logs">
      <div className="card-panel max-h-[70vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ice-100 text-xs uppercase text-ice-500">
              <th className="p-3">When</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Actor</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-b border-ice-50">
                <td className="p-3 text-xs">{new Date(String(r.createdAt)).toLocaleString()}</td>
                <td>{String(r.action)}</td>
                <td>
                  {String(r.entityType)} {String(r.entityId || '').slice(0, 8)}
                </td>
                <td>{(r.actor as { displayName?: string })?.displayName || '—'}</td>
                <td>{String(r.reason || '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

export function FraudPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const load = () => void api.get('/fraud').then((r) => setRows(r.data.data));
  useEffect(() => {
    load();
  }, []);
  return (
    <PageShell title="Fraud Alerts">
      <div className="space-y-3">
        {rows.map((f) => (
          <div key={String(f.id)} className="card-panel p-4">
            <div className="font-semibold text-rose-800">{String(f.title)}</div>
            <div className="text-sm text-ice-700">{String(f.description)}</div>
            <div className="mt-2 text-xs uppercase text-ice-500">
              {String(f.severity)} · {String(f.status)}
            </div>
            {f.status === 'open' && (
              <button type="button" className="btn-primary mt-3 !text-xs" onClick={() => void api.post(`/fraud/${f.id}/resolve`, { status: 'resolved' }).then(load)}>
                Resolve
              </button>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function BackupPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const load = () => void api.get('/backups').then((r) => setRows(r.data.data));
  useEffect(() => {
    load();
  }, []);
  return (
    <PageShell title="Backup & Restore">
      <button type="button" className="btn-primary" onClick={() => void api.post('/backups', { notes: 'Manual UI backup' }).then(load)}>
        Create backup now
      </button>
      <div className="space-y-2">
        {rows.map((b) => (
          <div key={String(b.id)} className="card-panel flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div>
              <div className="font-semibold">{String(b.filename)}</div>
              <div className="text-xs text-ice-500">
                {String(b.type)} · {(Number(b.sizeBytes) / 1024).toFixed(1)} KB · {new Date(String(b.createdAt)).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost !text-xs"
              onClick={async () => {
                const reason = prompt('Reason for restore?');
                if (!reason) return;
                if (!confirm('Restore will create a pre-restore backup first. Continue?')) return;
                await api.post(`/backups/${b.id}/restore`, { reason, confirm: true });
                alert('Restore complete. Restart the API server.');
              }}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [pin, setPin] = useState('');
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  return (
    <PageShell title="Settings & Security">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="card-panel space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void api.post('/auth/change-password', pwd).then(() => alert('Password updated'));
          }}
        >
          <h2 className="section-title">Change password</h2>
          <input className="input" type="password" placeholder="Current" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
          <input className="input" type="password" placeholder="New (min 8)" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
          <button className="btn-primary" type="submit">
            Update password
          </button>
        </form>
        <form
          className="card-panel space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void api.post('/auth/pin', { pin }).then(() => alert('PIN saved'));
          }}
        >
          <h2 className="section-title">Sensitive action PIN</h2>
          <p className="text-sm text-ice-600">Used for confirmations on reversals and voice-sensitive actions.</p>
          <input className="input" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4–8 digit PIN" />
          <button className="btn-primary" type="submit">
            Save PIN
          </button>
          <p className="text-xs text-ice-500">Logged in as {user?.username} ({user?.role})</p>
        </form>
      </div>
    </PageShell>
  );
}
