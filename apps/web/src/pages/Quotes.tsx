import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';

interface QuoteLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Quote {
  id: string;
  quote_number: string;
  guest_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_company: string | null;
  guest_address: string | null;
  booking_id: string | null;
  title: string;
  status: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  valid_until: string | null;
  accepted_at: string | null;
  converted_invoice_id: string | null;
  notes: string | null;
  terms: string | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  line_items?: QuoteLineItem[];
}

interface QuoteTemplate {
  id: string;
  name: string;
  description: string | null;
  line_items: string;
  discount_percent: number;
  tax_rate: number;
  terms: string | null;
  notes: string | null;
}

interface QuoteSummary {
  by_status: Array<{ status: string; count: number; total_amount: number }>;
  totals: { accepted_value: number; pending_value: number; converted_value: number; acceptance_rate: number | null };
}

type View = 'list' | 'detail' | 'create' | 'edit';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-purple-100 text-purple-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  converted: 'bg-emerald-100 text-emerald-700',
};

const emptyLineItem = (): QuoteLineItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 });

export function QuotesPage() {
  const { staff } = useAuth();
  const canCreate = staff?.permissions?.includes('quotes.create');
  const { toast } = useToast();

  const [view, setView] = useState<View>('list');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [summary, setSummary] = useState<QuoteSummary | null>(null);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });

  // Form state
  const [form, setForm] = useState({
    guest_name: '', guest_email: '', guest_company: '', guest_address: '',
    title: 'Studio Booking Quote', discount_percent: 0, tax_rate: 20,
    valid_until: '', notes: '', terms: '',
    line_items: [emptyLineItem()] as QuoteLineItem[],
  });

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page), per_page: '25' });
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);

    const res = await api.get<Quote[]>(`/quotes?${params}`);
    if (res.success && res.data) {
      setQuotes(res.data);
      if (res.pagination) setPagination(p => ({ ...p, total: res.pagination!.total, total_pages: res.pagination!.total_pages }));
    }
    setLoading(false);
  }, [pagination.page, statusFilter, search]);

  const fetchSummary = useCallback(async () => {
    const res = await api.get<QuoteSummary>('/quotes/summary');
    if (res.success && res.data) setSummary(res.data);
  }, []);

  const fetchTemplates = useCallback(async () => {
    const res = await api.get<QuoteTemplate[]>('/quotes/templates');
    if (res.success && res.data) setTemplates(res.data);
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);
  useEffect(() => { fetchSummary(); fetchTemplates(); }, [fetchSummary, fetchTemplates]);

  const openDetail = async (id: string) => {
    const res = await api.get<Quote>(`/quotes/${id}`);
    if (res.success && res.data) {
      setSelectedQuote(res.data);
      setView('detail');
    }
  };

  const updateLineItem = (index: number, field: keyof QuoteLineItem, value: string | number) => {
    setForm(f => {
      const items = [...f.line_items];
      const item = { ...items[index]! };
      if (field === 'description') item.description = value as string;
      else if (field === 'quantity') { item.quantity = Number(value); item.total = item.quantity * item.unit_price; }
      else if (field === 'unit_price') { item.unit_price = Number(value); item.total = item.quantity * item.unit_price; }
      items[index] = item;
      return { ...f, line_items: items };
    });
  };

  const addLineItem = () => setForm(f => ({ ...f, line_items: [...f.line_items, emptyLineItem()] }));
  const removeLineItem = (index: number) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, i) => i !== index) }));

  const calcTotals = () => {
    const subtotal = form.line_items.reduce((s, i) => s + i.total, 0);
    const discountAmt = subtotal * (form.discount_percent / 100);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * (form.tax_rate / 100);
    return { subtotal, discountAmt, taxAmt, total: afterDiscount + taxAmt };
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    try {
      const items = JSON.parse(tmpl.line_items) as QuoteLineItem[];
      setForm(f => ({
        ...f,
        line_items: items.length > 0 ? items : [emptyLineItem()],
        discount_percent: tmpl.discount_percent,
        tax_rate: tmpl.tax_rate,
        terms: tmpl.terms ?? f.terms,
        notes: tmpl.notes ?? f.notes,
      }));
    } catch { /* ignore parse errors */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = form.line_items.filter(i => i.description.trim());
    if (validItems.length === 0) { toast('Add at least one line item', 'error'); return; }

    const res = await api.post<{ id: string; quote_number: string }>('/quotes', {
      guest_name: form.guest_name,
      guest_email: form.guest_email || null,
      guest_company: form.guest_company || null,
      guest_address: form.guest_address || null,
      title: form.title,
      line_items: validItems,
      discount_percent: form.discount_percent,
      tax_rate: form.tax_rate,
      valid_until: form.valid_until || undefined,
      notes: form.notes || null,
      terms: form.terms || null,
    });

    if (res.success) {
      toast(`Quote ${res.data?.quote_number} created`, 'success');
      resetForm();
      setView('list');
      fetchQuotes();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Failed to create quote', 'error');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuote) return;
    const validItems = form.line_items.filter(i => i.description.trim());

    const res = await api.patch<{ id: string }>(`/quotes/${selectedQuote.id}`, {
      guest_name: form.guest_name,
      guest_email: form.guest_email || null,
      guest_company: form.guest_company || null,
      guest_address: form.guest_address || null,
      title: form.title,
      line_items: validItems.length > 0 ? validItems : undefined,
      discount_percent: form.discount_percent,
      tax_rate: form.tax_rate,
      valid_until: form.valid_until || null,
      notes: form.notes || null,
      terms: form.terms || null,
    });

    if (res.success) {
      toast('Quote updated', 'success');
      openDetail(selectedQuote.id);
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    const res = await api.patch<{ id: string }>(`/quotes/${id}`, { status });
    if (res.success) {
      toast(`Quote marked as ${status}`, 'success');
      openDetail(id);
      fetchQuotes();
      fetchSummary();
    }
  };

  const handleConvertToInvoice = async (id: string) => {
    const res = await api.post<{ invoice_id: string; invoice_number: string }>(`/quotes/${id}/convert-to-invoice`, {});
    if (res.success) {
      toast(`Converted to invoice ${res.data?.invoice_number}`, 'success');
      openDetail(id);
      fetchQuotes();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Conversion failed', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quote?')) return;
    const res = await api.delete<void>(`/quotes/${id}`);
    if (res.success) {
      toast('Quote deleted', 'success');
      setView('list');
      fetchQuotes();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const resetForm = () => {
    setForm({ guest_name: '', guest_email: '', guest_company: '', guest_address: '', title: 'Studio Booking Quote', discount_percent: 0, tax_rate: 20, valid_until: '', notes: '', terms: '', line_items: [emptyLineItem()] });
  };

  const startEdit = (q: Quote) => {
    setForm({
      guest_name: q.guest_name, guest_email: q.guest_email ?? '', guest_company: q.guest_company ?? '', guest_address: q.guest_address ?? '',
      title: q.title, discount_percent: q.discount_percent, tax_rate: q.tax_rate,
      valid_until: q.valid_until ?? '', notes: q.notes ?? '', terms: q.terms ?? '',
      line_items: q.line_items && q.line_items.length > 0 ? q.line_items : [emptyLineItem()],
    });
    setView('edit');
  };

  const formatCurrency = (v: number) => `£${v.toFixed(2)}`;
  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d + (d.includes('T') ? '' : 'T00:00:00Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  const { subtotal, discountAmt, taxAmt, total } = calcTotals();

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {view === 'detail' ? selectedQuote?.quote_number : view === 'create' ? 'New Quote' : view === 'edit' ? 'Edit Quote' : 'Quotes & Proposals'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {view === 'list' ? 'Create, manage, and convert branded quotes and proposals' : view === 'create' ? 'Build a professional quote for your client' : view === 'edit' ? 'Update quote details' : selectedQuote?.title ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSelectedQuote(null); resetForm(); }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Back</button>
          )}
          {view === 'list' && canCreate && (
            <button onClick={() => { resetForm(); setView('create'); }}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">New Quote</button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {view === 'list' && summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Pending Value</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(summary.totals?.pending_value ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Accepted Value</p>
            <p className="mt-1 text-xl font-bold text-green-600">{formatCurrency(summary.totals?.accepted_value ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Converted to Invoice</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(summary.totals?.converted_value ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Acceptance Rate</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{summary.totals?.acceptance_rate != null ? `${summary.totals.acceptance_rate.toFixed(0)}%` : '—'}</p>
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input type="text" placeholder="Search quotes..." value={search}
              onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">All Statuses</option>
              {['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Quote</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Valid Until</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : quotes.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No quotes yet</td></tr>
                ) : quotes.map(q => (
                  <tr key={q.id} onClick={() => openDetail(q.id)} className="cursor-pointer transition-colors hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{q.quote_number}</p>
                      <p className="text-xs text-gray-500">{q.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{q.guest_name}</p>
                      {q.guest_company && <p className="text-xs text-gray-500">{q.guest_company}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[q.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(q.total)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(q.valid_until)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(q.created_at)}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {q.status === 'draft' && (
                        <button onClick={() => handleDelete(q.id)} className="text-xs font-medium text-red-600 hover:text-red-700">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{pagination.total} quotes</p>
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

      {/* Detail View */}
      {view === 'detail' && selectedQuote && (
        <div className="space-y-6">
          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${STATUS_STYLES[selectedQuote.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {selectedQuote.status}
            </span>
            <div className="flex-1" />

            {selectedQuote.status === 'draft' && canCreate && (
              <>
                <button onClick={() => startEdit(selectedQuote)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                <button onClick={() => handleStatusChange(selectedQuote.id, 'sent')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Mark as Sent</button>
                <button onClick={() => handleDelete(selectedQuote.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
              </>
            )}
            {selectedQuote.status === 'sent' && canCreate && (
              <>
                <button onClick={() => handleStatusChange(selectedQuote.id, 'viewed')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Mark as Viewed</button>
                <button onClick={() => handleStatusChange(selectedQuote.id, 'accepted')} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Accept</button>
                <button onClick={() => handleStatusChange(selectedQuote.id, 'declined')} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Decline</button>
              </>
            )}
            {selectedQuote.status === 'viewed' && canCreate && (
              <>
                <button onClick={() => handleStatusChange(selectedQuote.id, 'accepted')} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Accept</button>
                <button onClick={() => handleStatusChange(selectedQuote.id, 'declined')} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Decline</button>
              </>
            )}
            {selectedQuote.status === 'accepted' && !selectedQuote.converted_invoice_id && canCreate && (
              <button onClick={() => handleConvertToInvoice(selectedQuote.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Convert to Invoice</button>
            )}

            <a href={`/api/quotes/${selectedQuote.id}/download`} target="_blank" rel="noreferrer"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              View PDF
            </a>
          </div>

          {/* Quote details */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {/* Line Items */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Line Items</h3>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-left text-xs font-semibold text-gray-500">Description</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">Qty</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">Unit Price</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedQuote.line_items ?? []).map((item, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="py-3 text-right text-sm text-gray-600">{item.quantity}</td>
                        <td className="py-3 text-right text-sm text-gray-600">{formatCurrency(item.unit_price)}</td>
                        <td className="py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{formatCurrency(selectedQuote.subtotal)}</span></div>
                    {selectedQuote.discount_amount > 0 && (
                      <div className="flex justify-between text-sm text-gray-500"><span>Discount ({selectedQuote.discount_percent}%)</span><span>-{formatCurrency(selectedQuote.discount_amount)}</span></div>
                    )}
                    <div className="flex justify-between text-sm text-gray-500"><span>VAT ({selectedQuote.tax_rate}%)</span><span>{formatCurrency(selectedQuote.tax_amount)}</span></div>
                    <div className="flex justify-between border-t pt-2 text-lg font-bold text-gray-900"><span>Total</span><span>{formatCurrency(selectedQuote.total)}</span></div>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              {(selectedQuote.notes || selectedQuote.terms) && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                  {selectedQuote.notes && (
                    <div className="mb-4">
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Notes</h3>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{selectedQuote.notes}</p>
                    </div>
                  )}
                  {selectedQuote.terms && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Terms & Conditions</h3>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{selectedQuote.terms}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Client Details</h3>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-gray-900">{selectedQuote.guest_name}</p>
                  {selectedQuote.guest_company && <p className="text-gray-600">{selectedQuote.guest_company}</p>}
                  {selectedQuote.guest_email && <p className="text-gray-600">{selectedQuote.guest_email}</p>}
                  {selectedQuote.guest_address && <p className="text-gray-600">{selectedQuote.guest_address}</p>}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Quote Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-gray-900">{formatDate(selectedQuote.created_at)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Valid Until</span><span className="text-gray-900">{formatDate(selectedQuote.valid_until)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Created By</span><span className="text-gray-900">{selectedQuote.creator_name ?? '—'}</span></div>
                  {selectedQuote.accepted_at && <div className="flex justify-between"><span className="text-gray-500">Accepted</span><span className="text-green-600 font-medium">{formatDate(selectedQuote.accepted_at)}</span></div>}
                  {selectedQuote.converted_invoice_id && <div className="flex justify-between"><span className="text-gray-500">Invoice</span><a href={`/invoices`} className="text-blue-600 hover:underline">View Invoice</a></div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {(view === 'create' || view === 'edit') && (
        <form onSubmit={view === 'create' ? handleCreate : handleEdit} className="space-y-6">
          {/* Template selector */}
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

          {/* Client Details */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Client Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
                <input type="text" value={form.guest_address} onChange={e => setForm(f => ({ ...f, guest_address: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Quote Details */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Quote Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Valid Until</label>
                <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Line Items</h3>
            <div className="space-y-3">
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {i === 0 && <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>}
                    <input type="text" placeholder="Description" value={item.description}
                      onChange={e => updateLineItem(i, 'description', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="mb-1 block text-xs font-medium text-gray-500">Qty</label>}
                    <input type="number" min="0.01" step="0.01" value={item.quantity}
                      onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="mb-1 block text-xs font-medium text-gray-500">Unit Price</label>}
                    <input type="number" min="0" step="0.01" value={item.unit_price}
                      onChange={e => updateLineItem(i, 'unit_price', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="mb-1 block text-xs font-medium text-gray-500">Total</label>}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
                      {formatCurrency(item.total)}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {form.line_items.length > 1 && (
                      <button type="button" onClick={() => removeLineItem(i)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLineItem} className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">+ Add Line Item</button>

            {/* Totals */}
            <div className="mt-6 flex justify-end">
              <div className="w-72 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium text-gray-900">{formatCurrency(subtotal)}</span></div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Discount</span>
                    <input type="number" min="0" max="100" step="0.5" value={form.discount_percent}
                      onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))}
                      className="w-16 rounded border border-gray-200 px-2 py-1 text-xs" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <span className="font-medium text-gray-900">-{formatCurrency(discountAmt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">VAT</span>
                    <input type="number" min="0" max="100" step="0.5" value={form.tax_rate}
                      onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))}
                      className="w-16 rounded border border-gray-200 px-2 py-1 text-xs" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <span className="font-medium text-gray-900">{formatCurrency(taxAmt)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-bold text-gray-900"><span>Total</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes for the client..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Terms & Conditions</label>
                <textarea rows={3} value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                  placeholder="Payment terms, cancellation policy..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setView(view === 'edit' ? 'detail' : 'list'); resetForm(); }}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
              {view === 'create' ? 'Create Quote' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
