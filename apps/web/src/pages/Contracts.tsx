import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';

interface Contract {
  id: string;
  contract_number: string;
  guest_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_company: string | null;
  booking_id: string | null;
  quote_id: string | null;
  title: string;
  status: string;
  content: string;
  start_date: string | null;
  end_date: string | null;
  value: number;
  currency: string;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  notes: string | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
}

interface ContractSummary {
  total_contracts: number;
  active: number;
  pending: number;
  signed: number;
  total_value: number;
  expired: number;
}

type View = 'list' | 'detail' | 'create' | 'edit';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  signed: 'bg-green-100 text-green-700',
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function ContractsPage() {
  const { staff } = useAuth();
  const canManage = staff?.permissions?.includes('contracts.manage');
  const { toast } = useToast();

  const [view, setView] = useState<View>('list');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });

  const [form, setForm] = useState({
    guest_name: '', guest_email: '', guest_company: '',
    title: 'Studio Booking Agreement', content: '',
    start_date: '', end_date: '', value: 0, notes: '', template_id: '',
  });

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page), per_page: '25' });
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    const res = await api.get<Contract[]>(`/contracts?${params}`);
    if (res.success && res.data) {
      setContracts(res.data);
      if (res.pagination) setPagination(p => ({ ...p, total: res.pagination!.total, total_pages: res.pagination!.total_pages }));
    }
    setLoading(false);
  }, [pagination.page, statusFilter, search]);

  const fetchSummary = useCallback(async () => {
    const res = await api.get<ContractSummary>('/contracts/summary');
    if (res.success && res.data) setSummary(res.data);
  }, []);

  const fetchTemplates = useCallback(async () => {
    const res = await api.get<ContractTemplate[]>('/contracts/templates');
    if (res.success && res.data) setTemplates(res.data);
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);
  useEffect(() => { fetchSummary(); fetchTemplates(); }, [fetchSummary, fetchTemplates]);

  const openDetail = async (id: string) => {
    const res = await api.get<Contract>(`/contracts/${id}`);
    if (res.success && res.data) { setSelected(res.data); setView('detail'); }
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setForm(f => ({ ...f, content: tmpl.content, template_id: templateId }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ id: string; contract_number: string }>('/contracts', {
      guest_name: form.guest_name,
      guest_email: form.guest_email || null,
      guest_company: form.guest_company || null,
      title: form.title,
      content: form.content,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      value: form.value,
      notes: form.notes || null,
      template_id: form.template_id || undefined,
    });
    if (res.success) {
      toast(`Contract ${res.data?.contract_number} created`, 'success');
      resetForm();
      setView('list');
      fetchContracts();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const res = await api.patch<{ id: string }>(`/contracts/${selected.id}`, {
      guest_name: form.guest_name,
      guest_email: form.guest_email || null,
      guest_company: form.guest_company || null,
      title: form.title,
      content: form.content,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      value: form.value,
      notes: form.notes || null,
    });
    if (res.success) {
      toast('Contract updated', 'success');
      openDetail(selected.id);
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const handleStatusChange = async (id: string, status: string, extra?: Record<string, string>) => {
    const res = await api.patch<{ id: string }>(`/contracts/${id}`, { status, ...extra });
    if (res.success) {
      toast(`Contract ${status}`, 'success');
      openDetail(id);
      fetchContracts();
      fetchSummary();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contract?')) return;
    const res = await api.delete<void>(`/contracts/${id}`);
    if (res.success) {
      toast('Contract deleted', 'success');
      setView('list');
      fetchContracts();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const resetForm = () => {
    setForm({ guest_name: '', guest_email: '', guest_company: '', title: 'Studio Booking Agreement', content: '', start_date: '', end_date: '', value: 0, notes: '', template_id: '' });
  };

  const startEdit = (ct: Contract) => {
    setForm({
      guest_name: ct.guest_name, guest_email: ct.guest_email ?? '', guest_company: ct.guest_company ?? '',
      title: ct.title, content: ct.content, start_date: ct.start_date ?? '', end_date: ct.end_date ?? '',
      value: ct.value, notes: ct.notes ?? '', template_id: '',
    });
    setView('edit');
  };

  const formatCurrency = (v: number) => `£${v.toFixed(2)}`;
  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d + (d.includes('T') ? '' : 'T00:00:00Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {view === 'detail' ? selected?.contract_number : view === 'create' ? 'New Contract' : view === 'edit' ? 'Edit Contract' : 'Contracts & Agreements'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {view === 'list' ? 'Manage studio booking agreements and contracts' : view === 'create' ? 'Draft a new contract' : view === 'edit' ? 'Update contract details' : selected?.title ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSelected(null); resetForm(); }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Back</button>
          )}
          {view === 'list' && canManage && (
            <button onClick={() => { resetForm(); setView('create'); }}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">New Contract</button>
          )}
        </div>
      </div>

      {/* Summary */}
      {view === 'list' && summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total', value: summary.total_contracts },
            { label: 'Active', value: summary.active },
            { label: 'Pending', value: summary.pending },
            { label: 'Signed', value: summary.signed },
            { label: 'Total Value', value: formatCurrency(summary.total_value ?? 0) },
            { label: 'Expired', value: summary.expired },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input type="text" placeholder="Search contracts..." value={search}
              onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">All Statuses</option>
              {['draft', 'sent', 'signed', 'active', 'expired', 'cancelled'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Contract</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Dates</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : contracts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No contracts yet</td></tr>
                ) : contracts.map(ct => (
                  <tr key={ct.id} onClick={() => openDetail(ct.id)} className="cursor-pointer transition-colors hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{ct.contract_number}</p>
                      <p className="text-xs text-gray-500">{ct.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{ct.guest_name}</p>
                      {ct.guest_company && <p className="text-xs text-gray-500">{ct.guest_company}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[ct.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {ct.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(ct.value)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {ct.start_date ? `${formatDate(ct.start_date)}${ct.end_date ? ` – ${formatDate(ct.end_date)}` : ''}` : formatDate(ct.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {ct.status === 'draft' && canManage && (
                        <button onClick={() => handleDelete(ct.id)} className="text-xs font-medium text-red-600 hover:text-red-700">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{pagination.total} contracts</p>
              <div className="flex gap-2">
                <button onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} disabled={pagination.page <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
                <span className="px-3 py-1.5 text-sm text-gray-600">Page {pagination.page} of {pagination.total_pages}</span>
                <button onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} disabled={pagination.page >= pagination.total_pages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail */}
      {view === 'detail' && selected && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${STATUS_STYLES[selected.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {selected.status}
            </span>
            <div className="flex-1" />
            {selected.status === 'draft' && canManage && (
              <>
                <button onClick={() => startEdit(selected)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                <button onClick={() => handleStatusChange(selected.id, 'sent')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Mark as Sent</button>
                <button onClick={() => handleDelete(selected.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
              </>
            )}
            {selected.status === 'sent' && canManage && (
              <button onClick={() => {
                const name = prompt('Signed by (name):');
                if (name) handleStatusChange(selected.id, 'signed', { signed_by_name: name });
              }} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Mark as Signed</button>
            )}
            {selected.status === 'signed' && canManage && (
              <button onClick={() => handleStatusChange(selected.id, 'active')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Activate</button>
            )}
            {['active', 'signed'].includes(selected.status) && canManage && (
              <button onClick={() => handleStatusChange(selected.id, 'cancelled')} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Cancel</button>
            )}
            <a href={`/api/contracts/${selected.id}/download`} target="_blank" rel="noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">View PDF</a>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Contract Content</h3>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{selected.content || 'No content'}</div>
              </div>
              {selected.notes && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Notes</h3>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{selected.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Client</h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-gray-900">{selected.guest_name}</p>
                  {selected.guest_company && <p className="text-gray-600">{selected.guest_company}</p>}
                  {selected.guest_email && <p className="text-gray-600">{selected.guest_email}</p>}
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Value</span><span className="font-medium text-gray-900">{formatCurrency(selected.value)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Start</span><span>{formatDate(selected.start_date)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">End</span><span>{formatDate(selected.end_date)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{formatDate(selected.created_at)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">By</span><span>{selected.creator_name ?? '—'}</span></div>
                  {selected.signed_at && (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Signed</span><span className="font-medium text-green-600">{formatDate(selected.signed_at)}</span></div>
                      {selected.signed_by_name && <div className="flex justify-between"><span className="text-gray-500">Signed By</span><span>{selected.signed_by_name}</span></div>}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {(view === 'create' || view === 'edit') && (
        <form onSubmit={view === 'create' ? handleCreate : handleEdit} className="space-y-6">
          {view === 'create' && templates.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-medium text-gray-700">Apply Template</label>
              <select onChange={e => e.target.value && applyTemplate(e.target.value)} defaultValue=""
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">— Select a template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ''}</option>)}
              </select>
            </div>
          )}

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Client Details</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                <input type="text" required value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={form.guest_email} onChange={e => setForm(f => ({ ...f, guest_email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Company</label>
                <input type="text" value={form.guest_company} onChange={e => setForm(f => ({ ...f, guest_company: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Contract Details</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Value (£)</label>
                <input type="number" min="0" step="0.01" value={form.value} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Contract Body</h3>
            <textarea rows={12} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Enter the contract terms and conditions..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">Internal Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setView(view === 'edit' ? 'detail' : 'list'); resetForm(); }}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
              {view === 'create' ? 'Create Contract' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
