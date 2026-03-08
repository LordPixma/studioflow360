import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { usePermission } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';
import type { InvoiceRow, InvoiceLineItem } from '@studioflow360/shared';

type InvoiceWithJoins = InvoiceRow & { creator_name: string | null };

interface InvoiceSummary {
  by_status: { status: string; count: number; total_amount: number }[];
  revenue: { collected: number; outstanding: number; overdue: number } | null;
}

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'] as const;

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-amber-100 text-amber-700',
};

export function InvoicesPage() {
  const { toast } = useToast();
  const canCreate = usePermission('invoices.create');
  const [invoices, setInvoices] = useState<InvoiceWithJoins[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceWithJoins | null>(null);
  const [newInvoice, setNewInvoice] = useState({
    guest_name: '', guest_email: '', guest_address: '', tax_rate: 20,
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0]!; })(),
    notes: '',
    line_items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }] as InvoiceLineItem[],
  });

  const fetchInvoices = async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    const res = await api.get<InvoiceWithJoins[]>(`/invoices?${params}`);
    if (res.success && res.data) setInvoices(res.data as InvoiceWithJoins[]);
    setLoading(false);
  };

  const fetchSummary = async () => {
    const res = await api.get<InvoiceSummary>('/invoices/summary');
    if (res.success && res.data) setSummary(res.data);
  };

  useEffect(() => { fetchInvoices(); fetchSummary(); }, []);
  useEffect(() => { fetchInvoices(); }, [filterStatus]);

  const updateLineItem = (idx: number, field: keyof InvoiceLineItem, value: string | number) => {
    setNewInvoice(prev => {
      const items = [...prev.line_items];
      const item = { ...items[idx]! };
      (item as Record<string, unknown>)[field] = value;
      if (field === 'quantity' || field === 'unit_price') {
        item.total = item.quantity * item.unit_price;
      }
      items[idx] = item;
      return { ...prev, line_items: items };
    });
  };

  const addLineItem = () => {
    setNewInvoice(prev => ({ ...prev, line_items: [...prev.line_items, { description: '', quantity: 1, unit_price: 0, total: 0 }] }));
  };

  const removeLineItem = (idx: number) => {
    if (newInvoice.line_items.length <= 1) return;
    setNewInvoice(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== idx) }));
  };

  const createInvoice = async () => {
    if (!newInvoice.guest_name.trim()) return;
    const validItems = newInvoice.line_items.filter(i => i.description.trim() && i.total > 0);
    if (validItems.length === 0) { toast('Add at least one line item', 'error'); return; }
    const res = await api.post('/invoices', {
      guest_name: newInvoice.guest_name,
      guest_email: newInvoice.guest_email || undefined,
      guest_address: newInvoice.guest_address || undefined,
      tax_rate: newInvoice.tax_rate,
      due_date: newInvoice.due_date,
      notes: newInvoice.notes || undefined,
      line_items: validItems,
    });
    if (res.success) {
      toast('Invoice created', 'success');
      setShowCreate(false);
      setNewInvoice({ guest_name: '', guest_email: '', guest_address: '', tax_rate: 20, due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0]!; })(), notes: '', line_items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }] });
      fetchInvoices(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    const res = await api.patch(`/invoices/${id}`, { status });
    if (res.success) { toast('Invoice updated', 'success'); fetchInvoices(); fetchSummary(); setViewingInvoice(null); }
    else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  if (loading) return <div className="animate-fade-in space-y-6"><div className="skeleton h-16" /><div className="skeleton h-64" /></div>;

  const subtotal = newInvoice.line_items.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (newInvoice.tax_rate / 100);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Invoices</h1>
        {canCreate && (
          <button className={`btn ${showCreate ? 'btn-ghost' : 'btn-primary'}`} onClick={() => { setShowCreate(!showCreate); setViewingInvoice(null); }}>
            {showCreate ? 'Cancel' : '+ New Invoice'}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Invoices</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.by_status.reduce((s, x) => s + x.count, 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Collected</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{'\u00A3'}{(summary.revenue?.collected ?? 0).toFixed(0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{'\u00A3'}{(summary.revenue?.outstanding ?? 0).toFixed(0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Overdue</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{'\u00A3'}{(summary.revenue?.overdue ?? 0).toFixed(0)}</p>
          </div>
        </div>
      )}

      {/* Create Invoice Form */}
      {showCreate && canCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Invoice</h3>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Name</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newInvoice.guest_name} onChange={(e) => setNewInvoice(s => ({ ...s, guest_name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Email</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="email" value={newInvoice.guest_email} onChange={(e) => setNewInvoice(s => ({ ...s, guest_email: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Tax Rate (%)</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="number" value={newInvoice.tax_rate} onChange={(e) => setNewInvoice(s => ({ ...s, tax_rate: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Due Date</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="date" value={newInvoice.due_date} onChange={(e) => setNewInvoice(s => ({ ...s, due_date: e.target.value }))} />
            </div>
          </div>

          <h4 className="mb-2 text-xs font-semibold text-gray-500">Line Items</h4>
          <div className="space-y-2">
            {newInvoice.line_items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Description" value={item.description} onChange={(e) => updateLineItem(idx, 'description', e.target.value)} />
                <input className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm" type="number" placeholder="Qty" value={item.quantity || ''} onChange={(e) => updateLineItem(idx, 'quantity', Number(e.target.value))} />
                <input className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm" type="number" step="0.01" placeholder="Price" value={item.unit_price || ''} onChange={(e) => updateLineItem(idx, 'unit_price', Number(e.target.value))} />
                <span className="w-24 text-right text-sm font-semibold text-gray-700">{'\u00A3'}{item.total.toFixed(2)}</span>
                <button className="text-gray-400 hover:text-red-500" onClick={() => removeLineItem(idx)}>{'\u00D7'}</button>
              </div>
            ))}
          </div>
          <button className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700" onClick={addLineItem}>+ Add line item</button>

          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="text-sm text-gray-500">
              Subtotal: {'\u00A3'}{subtotal.toFixed(2)} | VAT ({newInvoice.tax_rate}%): {'\u00A3'}{taxAmount.toFixed(2)} | <span className="font-bold text-gray-900">Total: {'\u00A3'}{(subtotal + taxAmount).toFixed(2)}</span>
            </div>
            <button className="btn btn-success" onClick={createInvoice}>Create Invoice</button>
          </div>
        </div>
      )}

      {/* Invoice Detail View */}
      {viewingInvoice && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{viewingInvoice.invoice_number}</h3>
              <p className="text-xs text-gray-400">Issued {viewingInvoice.issued_date} {'\u00B7'} Due {viewingInvoice.due_date}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[viewingInvoice.status]}`}>{viewingInvoice.status}</span>
              <button className="btn btn-ghost text-xs" onClick={() => setViewingInvoice(null)}>Close</button>
            </div>
          </div>
          <div className="mb-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">{viewingInvoice.guest_name}</p>
            {viewingInvoice.guest_email && <p>{viewingInvoice.guest_email}</p>}
            {viewingInvoice.guest_address && <p>{viewingInvoice.guest_address}</p>}
          </div>
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-[11px] font-semibold uppercase text-gray-400">Item</th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase text-gray-400">Qty</th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase text-gray-400">Price</th>
                <th className="pb-2 text-right text-[11px] font-semibold uppercase text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {(JSON.parse(viewingInvoice.line_items) as InvoiceLineItem[]).map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="py-2 text-gray-900">{item.description}</td>
                  <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-2 text-right text-gray-600">{'\u00A3'}{item.unit_price.toFixed(2)}</td>
                  <td className="py-2 text-right font-medium text-gray-900">{'\u00A3'}{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-right text-sm">
            <p className="text-gray-500">Subtotal: {'\u00A3'}{viewingInvoice.subtotal.toFixed(2)}</p>
            <p className="text-gray-500">VAT ({viewingInvoice.tax_rate}%): {'\u00A3'}{viewingInvoice.tax_amount.toFixed(2)}</p>
            <p className="text-lg font-bold text-gray-900">Total: {'\u00A3'}{viewingInvoice.total.toFixed(2)}</p>
          </div>
          {canCreate && (
            <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4">
              {viewingInvoice.status === 'draft' && <button className="btn btn-primary text-xs" onClick={() => updateInvoiceStatus(viewingInvoice.id, 'sent')}>Mark as Sent</button>}
              {viewingInvoice.status === 'sent' && <button className="btn btn-success text-xs" onClick={() => updateInvoiceStatus(viewingInvoice.id, 'paid')}>Mark as Paid</button>}
              {['draft', 'sent'].includes(viewingInvoice.status) && <button className="btn btn-ghost text-xs text-red-600" onClick={() => updateInvoiceStatus(viewingInvoice.id, 'cancelled')}>Cancel</button>}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Invoice Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="p-6">
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No invoices yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invoice</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Guest</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Issued</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Due</th>
                  <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-3.5 font-semibold text-blue-600 cursor-pointer hover:text-blue-700" onClick={() => { setViewingInvoice(inv); setShowCreate(false); }}>{inv.invoice_number}</td>
                    <td className="py-3.5">
                      <p className="font-medium text-gray-900">{inv.guest_name}</p>
                      {inv.guest_email && <p className="text-[11px] text-gray-400">{inv.guest_email}</p>}
                    </td>
                    <td className="py-3.5 font-bold text-gray-900">{'\u00A3'}{inv.total.toFixed(2)}</td>
                    <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColors[inv.status]}`}>{inv.status}</span></td>
                    <td className="py-3.5 text-gray-500">{inv.issued_date}</td>
                    <td className="py-3.5 text-gray-500">{inv.due_date}</td>
                    <td className="py-3.5 text-right">
                      {canCreate && (
                        <div className="flex justify-end gap-1">
                          {inv.status === 'draft' && <button className="btn btn-primary py-0.5 text-[10px]" onClick={() => updateInvoiceStatus(inv.id, 'sent')}>Send</button>}
                          {inv.status === 'sent' && <button className="btn btn-success py-0.5 text-[10px]" onClick={() => updateInvoiceStatus(inv.id, 'paid')}>Paid</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
