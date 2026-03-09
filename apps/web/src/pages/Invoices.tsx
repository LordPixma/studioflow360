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

const defaultDueDate = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split('T')[0]!; };

export function InvoicesPage() {
  const { toast } = useToast();
  const canCreate = usePermission('invoices.create');
  const [invoices, setInvoices] = useState<InvoiceWithJoins[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceWithJoins | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    guest_name: string; guest_email: string; guest_address: string;
    tax_rate: number; due_date: string; notes: string;
    line_items: InvoiceLineItem[];
  } | null>(null);
  const [newInvoice, setNewInvoice] = useState({
    guest_name: '', guest_email: '', guest_address: '', tax_rate: 20,
    due_date: defaultDueDate(),
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

  // --- Line item helpers for create form ---
  const updateLineItem = (idx: number, field: keyof InvoiceLineItem, value: string | number) => {
    setNewInvoice(prev => {
      const items = [...prev.line_items];
      const item = { ...items[idx]! };
      (item as Record<string, unknown>)[field] = value;
      if (field === 'quantity' || field === 'unit_price') item.total = item.quantity * item.unit_price;
      items[idx] = item;
      return { ...prev, line_items: items };
    });
  };
  const addLineItem = () => { setNewInvoice(prev => ({ ...prev, line_items: [...prev.line_items, { description: '', quantity: 1, unit_price: 0, total: 0 }] })); };
  const removeLineItem = (idx: number) => { if (newInvoice.line_items.length <= 1) return; setNewInvoice(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== idx) })); };

  // --- Line item helpers for edit form ---
  const updateEditLineItem = (idx: number, field: keyof InvoiceLineItem, value: string | number) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const items = [...prev.line_items];
      const item = { ...items[idx]! };
      (item as Record<string, unknown>)[field] = value;
      if (field === 'quantity' || field === 'unit_price') item.total = item.quantity * item.unit_price;
      items[idx] = item;
      return { ...prev, line_items: items };
    });
  };
  const addEditLineItem = () => { setEditForm(prev => prev ? { ...prev, line_items: [...prev.line_items, { description: '', quantity: 1, unit_price: 0, total: 0 }] } : prev); };
  const removeEditLineItem = (idx: number) => { setEditForm(prev => prev && prev.line_items.length > 1 ? { ...prev, line_items: prev.line_items.filter((_, i) => i !== idx) } : prev); };

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
      setNewInvoice({ guest_name: '', guest_email: '', guest_address: '', tax_rate: 20, due_date: defaultDueDate(), notes: '', line_items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }] });
      fetchInvoices(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    const res = await api.patch(`/invoices/${id}`, { status });
    if (res.success) { toast('Invoice updated', 'success'); fetchInvoices(); fetchSummary(); setViewingInvoice(null); setEditing(false); }
    else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const startEditing = (inv: InvoiceWithJoins) => {
    setEditing(true);
    setEditForm({
      guest_name: inv.guest_name,
      guest_email: inv.guest_email ?? '',
      guest_address: inv.guest_address ?? '',
      tax_rate: inv.tax_rate,
      due_date: inv.due_date,
      notes: inv.notes ?? '',
      line_items: JSON.parse(inv.line_items) as InvoiceLineItem[],
    });
  };

  const saveEdit = async () => {
    if (!viewingInvoice || !editForm) return;
    if (!editForm.guest_name.trim()) { toast('Guest name is required', 'error'); return; }
    const validItems = editForm.line_items.filter(i => i.description.trim() && i.total > 0);
    if (validItems.length === 0) { toast('Add at least one line item', 'error'); return; }
    const res = await api.patch(`/invoices/${viewingInvoice.id}`, {
      guest_name: editForm.guest_name,
      guest_email: editForm.guest_email || undefined,
      guest_address: editForm.guest_address || undefined,
      tax_rate: editForm.tax_rate,
      due_date: editForm.due_date,
      notes: editForm.notes || undefined,
      line_items: validItems,
    });
    if (res.success) {
      toast('Invoice updated', 'success');
      setEditing(false); setEditForm(null); setViewingInvoice(null);
      fetchInvoices(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const deleteInvoice = async (inv: InvoiceWithJoins) => {
    if (inv.status !== 'draft') { toast('Only draft invoices can be deleted', 'error'); return; }
    if (!confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return;
    const res = await api.delete(`/invoices/${inv.id}`);
    if (res.success) {
      toast('Invoice deleted', 'success');
      setViewingInvoice(null); setEditing(false);
      fetchInvoices(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const downloadInvoice = (id: string) => { window.open(`/api/invoices/${id}/download`, '_blank'); };

  if (loading) return <div className="animate-fade-in space-y-6"><div className="skeleton h-16" /><div className="skeleton h-64" /></div>;

  const subtotal = newInvoice.line_items.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (newInvoice.tax_rate / 100);

  const editSubtotal = editForm ? editForm.line_items.reduce((s, i) => s + i.total, 0) : 0;
  const editTaxAmount = editForm ? editSubtotal * (editForm.tax_rate / 100) : 0;

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm';

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Invoices</h1>
        {canCreate && (
          <button className={`btn ${showCreate ? 'btn-ghost' : 'btn-primary'}`} onClick={() => { setShowCreate(!showCreate); setViewingInvoice(null); setEditing(false); }}>
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
              <input className={inputCls} value={newInvoice.guest_name} onChange={(e) => setNewInvoice(s => ({ ...s, guest_name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Email</label>
              <input className={inputCls} type="email" value={newInvoice.guest_email} onChange={(e) => setNewInvoice(s => ({ ...s, guest_email: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Tax Rate (%)</label>
              <input className={inputCls} type="number" value={newInvoice.tax_rate} onChange={(e) => setNewInvoice(s => ({ ...s, tax_rate: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Due Date</label>
              <input className={inputCls} type="date" value={newInvoice.due_date} onChange={(e) => setNewInvoice(s => ({ ...s, due_date: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Address</label>
            <input className={inputCls} value={newInvoice.guest_address} onChange={(e) => setNewInvoice(s => ({ ...s, guest_address: e.target.value }))} />
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

          <div className="mb-4 mt-4">
            <label className="mb-1 block text-[11px] font-medium text-gray-500">Notes</label>
            <textarea className={inputCls + ' resize-y'} rows={2} value={newInvoice.notes} onChange={(e) => setNewInvoice(s => ({ ...s, notes: e.target.value }))} />
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="text-sm text-gray-500">
              Subtotal: {'\u00A3'}{subtotal.toFixed(2)} | VAT ({newInvoice.tax_rate}%): {'\u00A3'}{taxAmount.toFixed(2)} | <span className="font-bold text-gray-900">Total: {'\u00A3'}{(subtotal + taxAmount).toFixed(2)}</span>
            </div>
            <button className="btn btn-success" onClick={createInvoice}>Create Invoice</button>
          </div>
        </div>
      )}

      {/* Invoice Detail / Edit View */}
      {viewingInvoice && !editing && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{viewingInvoice.invoice_number}</h3>
              <p className="text-xs text-gray-400">Issued {viewingInvoice.issued_date} {'\u00B7'} Due {viewingInvoice.due_date}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[viewingInvoice.status]}`}>{viewingInvoice.status}</span>
              <button className="btn btn-ghost text-xs flex items-center gap-1" onClick={() => downloadInvoice(viewingInvoice.id)}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download
              </button>
              {canCreate && viewingInvoice.status === 'draft' && (
                <button className="btn btn-ghost text-xs" onClick={() => startEditing(viewingInvoice)}>Edit</button>
              )}
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
          {viewingInvoice.notes && (
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] font-semibold uppercase text-gray-400">Notes</p>
              <p className="mt-1 text-sm text-gray-600">{viewingInvoice.notes}</p>
            </div>
          )}
          {canCreate && (
            <div className="mt-4 flex justify-between border-t border-gray-100 pt-4">
              <div>
                {viewingInvoice.status === 'draft' && (
                  <button className="btn btn-ghost text-xs text-red-600 hover:bg-red-50" onClick={() => deleteInvoice(viewingInvoice)}>Delete Invoice</button>
                )}
              </div>
              <div className="flex gap-2">
                {viewingInvoice.status === 'draft' && <button className="btn btn-primary text-xs" onClick={() => updateInvoiceStatus(viewingInvoice.id, 'sent')}>Mark as Sent</button>}
                {viewingInvoice.status === 'sent' && <button className="btn btn-success text-xs" onClick={() => updateInvoiceStatus(viewingInvoice.id, 'paid')}>Mark as Paid</button>}
                {['draft', 'sent'].includes(viewingInvoice.status) && <button className="btn btn-ghost text-xs text-red-600" onClick={() => updateInvoiceStatus(viewingInvoice.id, 'cancelled')}>Cancel Invoice</button>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Invoice Form */}
      {viewingInvoice && editing && editForm && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Edit {viewingInvoice.invoice_number}</h3>
            <button className="btn btn-ghost text-xs" onClick={() => { setEditing(false); setEditForm(null); }}>Cancel Edit</button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Name</label>
              <input className={inputCls} value={editForm.guest_name} onChange={(e) => setEditForm(f => f && ({ ...f, guest_name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Email</label>
              <input className={inputCls} type="email" value={editForm.guest_email} onChange={(e) => setEditForm(f => f && ({ ...f, guest_email: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Tax Rate (%)</label>
              <input className={inputCls} type="number" value={editForm.tax_rate} onChange={(e) => setEditForm(f => f && ({ ...f, tax_rate: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Due Date</label>
              <input className={inputCls} type="date" value={editForm.due_date} onChange={(e) => setEditForm(f => f && ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Address</label>
            <input className={inputCls} value={editForm.guest_address} onChange={(e) => setEditForm(f => f && ({ ...f, guest_address: e.target.value }))} />
          </div>

          <h4 className="mb-2 text-xs font-semibold text-gray-500">Line Items</h4>
          <div className="space-y-2">
            {editForm.line_items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Description" value={item.description} onChange={(e) => updateEditLineItem(idx, 'description', e.target.value)} />
                <input className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm" type="number" placeholder="Qty" value={item.quantity || ''} onChange={(e) => updateEditLineItem(idx, 'quantity', Number(e.target.value))} />
                <input className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm" type="number" step="0.01" placeholder="Price" value={item.unit_price || ''} onChange={(e) => updateEditLineItem(idx, 'unit_price', Number(e.target.value))} />
                <span className="w-24 text-right text-sm font-semibold text-gray-700">{'\u00A3'}{item.total.toFixed(2)}</span>
                <button className="text-gray-400 hover:text-red-500" onClick={() => removeEditLineItem(idx)}>{'\u00D7'}</button>
              </div>
            ))}
          </div>
          <button className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700" onClick={addEditLineItem}>+ Add line item</button>

          <div className="mb-4 mt-4">
            <label className="mb-1 block text-[11px] font-medium text-gray-500">Notes</label>
            <textarea className={inputCls + ' resize-y'} rows={2} value={editForm.notes} onChange={(e) => setEditForm(f => f && ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="text-sm text-gray-500">
              Subtotal: {'\u00A3'}{editSubtotal.toFixed(2)} | VAT ({editForm.tax_rate}%): {'\u00A3'}{editTaxAmount.toFixed(2)} | <span className="font-bold text-gray-900">Total: {'\u00A3'}{(editSubtotal + editTaxAmount).toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => { setEditing(false); setEditForm(null); }}>Cancel</button>
              <button className="btn btn-success" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
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
                    <td className="py-3.5 font-semibold text-blue-600 cursor-pointer hover:text-blue-700" onClick={() => { setViewingInvoice(inv); setShowCreate(false); setEditing(false); }}>{inv.invoice_number}</td>
                    <td className="py-3.5">
                      <p className="font-medium text-gray-900">{inv.guest_name}</p>
                      {inv.guest_email && <p className="text-[11px] text-gray-400">{inv.guest_email}</p>}
                    </td>
                    <td className="py-3.5 font-bold text-gray-900">{'\u00A3'}{inv.total.toFixed(2)}</td>
                    <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColors[inv.status]}`}>{inv.status}</span></td>
                    <td className="py-3.5 text-gray-500">{inv.issued_date}</td>
                    <td className="py-3.5 text-gray-500">{inv.due_date}</td>
                    <td className="py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700" title="Download invoice" onClick={(e) => { e.stopPropagation(); downloadInvoice(inv.id); }}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </button>
                        {canCreate && (
                          <>
                            {inv.status === 'draft' && <button className="btn btn-primary py-0.5 text-[10px]" onClick={() => updateInvoiceStatus(inv.id, 'sent')}>Send</button>}
                            {inv.status === 'sent' && <button className="btn btn-success py-0.5 text-[10px]" onClick={() => updateInvoiceStatus(inv.id, 'paid')}>Paid</button>}
                            {inv.status === 'draft' && (
                              <button className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete" onClick={(e) => { e.stopPropagation(); deleteInvoice(inv); }}>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
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
