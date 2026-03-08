import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.ts';
import { useToast } from '../components/Toast.tsx';
import type { StudioItemRow, ApiResponse } from '@studioflow360/shared';
import { STUDIO_ITEM_CATEGORIES, STUDIO_ITEM_STATUSES, STUDIO_ITEM_PRIORITIES, STUDIO_ITEM_RECURRENCES } from '@studioflow360/shared';
import type { StudioItemCategory, StudioItemStatus, StudioItemPriority } from '@studioflow360/shared';

interface StudioItemWithNames extends StudioItemRow {
  creator_name?: string;
  assignee_name?: string;
}

interface PaginatedResponse {
  page: number; per_page: number; total: number; total_pages: number;
}

const categoryConfig: Record<string, { label: string; color: string; bg: string }> = {
  maintenance: { label: 'Maintenance', color: 'text-orange-700', bg: 'bg-orange-50' },
  insurance: { label: 'Insurance', color: 'text-blue-700', bg: 'bg-blue-50' },
  consumables: { label: 'Consumables', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  contracts: { label: 'Contracts', color: 'text-purple-700', bg: 'bg-purple-50' },
};

const statusConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  pending: { label: 'Pending', dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-400', bg: 'bg-blue-50', text: 'text-blue-700' },
  completed: { label: 'Completed', dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  overdue: { label: 'Overdue', dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-700' },
  cancelled: { label: 'Cancelled', dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-gray-500' },
  medium: { label: 'Medium', color: 'text-blue-600' },
  high: { label: 'High', color: 'text-orange-600' },
  urgent: { label: 'Urgent', color: 'text-red-600' },
};

const emptyForm = {
  category: 'maintenance' as StudioItemCategory,
  title: '',
  description: '',
  status: 'pending' as StudioItemStatus,
  priority: 'medium' as StudioItemPriority,
  due_date: '',
  cost: '',
  vendor: '',
  recurrence: 'none' as string,
  notes: '',
};

export function StudioManagementPage() {
  const [items, setItems] = useState<StudioItemWithNames[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [filters, setFilters] = useState({ category: '' as StudioItemCategory | '', status: '' as StudioItemStatus | '', page: 1 });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.status) params.set('status', filters.status);
    params.set('page', String(filters.page));

    api.get<StudioItemWithNames[]>(`/studio-items?${params}`).then((res: ApiResponse<StudioItemWithNames[]> & { pagination?: PaginatedResponse }) => {
      if (res.success && res.data) {
        setItems(res.data);
        if (res.pagination) setPagination(res.pagination);
      }
      setLoading(false);
    });
  }, [filters]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const submitForm = async () => {
    if (!form.title.trim()) { toast('Title is required', 'warning'); return; }
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      category: form.category,
      title: form.title.trim(),
      status: form.status,
      priority: form.priority,
      recurrence: form.recurrence,
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.due_date) payload.due_date = form.due_date;
    if (form.cost !== '') payload.cost = Number(form.cost);
    if (form.vendor.trim()) payload.vendor = form.vendor.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();

    const res = editingId
      ? await api.patch(`/studio-items/${editingId}`, payload)
      : await api.post('/studio-items', payload);

    if (res.success) {
      toast(editingId ? 'Item updated' : 'Item created', 'success');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchItems();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
    setSubmitting(false);
  };

  const startEdit = (item: StudioItemWithNames) => {
    setEditingId(item.id);
    setForm({
      category: item.category,
      title: item.title,
      description: item.description ?? '',
      status: item.status,
      priority: item.priority,
      due_date: item.due_date ?? '',
      cost: item.cost != null ? String(item.cost) : '',
      vendor: item.vendor ?? '',
      recurrence: item.recurrence,
      notes: item.notes ?? '',
    });
    setShowForm(true);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Cancel this item?')) return;
    const res = await api.delete(`/studio-items/${id}`);
    if (res.success) { toast('Item cancelled', 'success'); fetchItems(); }
  };

  const updateStatus = async (id: string, status: StudioItemStatus) => {
    const res = await api.patch(`/studio-items/${id}`, { status });
    if (res.success) { toast('Status updated', 'success'); fetchItems(); }
  };

  const today = new Date().toISOString().split('T')[0]!;

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Studio Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Maintenance, insurance, consumables, and contracts
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value as StudioItemCategory | '', page: 1 }))}
          >
            <option value="">All Categories</option>
            {STUDIO_ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryConfig[c]?.label ?? c}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StudioItemStatus | '', page: 1 }))}
          >
            <option value="">All Statuses</option>
            {STUDIO_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>{statusConfig[s]?.label ?? s}</option>
            ))}
          </select>
          <button
            className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => { setShowForm(!showForm); if (showForm) { setEditingId(null); setForm(emptyForm); } }}
          >
            {showForm ? 'Cancel' : '+ New Item'}
          </button>
        </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {editingId ? 'Edit Item' : 'New Item'}
          </h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Title *</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Category</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as StudioItemCategory }))}>
                {STUDIO_ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{categoryConfig[c]?.label ?? c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Priority</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as StudioItemPriority }))}>
                {STUDIO_ITEM_PRIORITIES.map((p) => <option key={p} value={p}>{priorityConfig[p]?.label ?? p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Due Date</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">{'\u00A3'} Cost</label>
              <input type="number" step="0.01" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                placeholder="Optional" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Vendor</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                placeholder="Optional" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Recurrence</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}>
                {STUDIO_ITEM_RECURRENCES.map((r) => <option key={r} value={r}>{r === 'none' ? 'One-time' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Description</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                placeholder="Optional" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Notes</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                placeholder="Optional" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn btn-success" onClick={submitForm} disabled={submitting}>
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-[72px]" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <p className="text-base font-semibold text-gray-900">No items found</p>
          <p className="mt-1 text-sm text-gray-500">
            {filters.category || filters.status ? 'Try adjusting your filters.' : 'Create your first studio management item.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const cat = categoryConfig[item.category];
            const status = statusConfig[item.status];
            const priority = priorityConfig[item.priority];
            const isOverdue = item.due_date && item.due_date < today && item.status !== 'completed' && item.status !== 'cancelled';

            return (
              <div key={item.id} className={`card-interactive rounded-xl bg-white p-4 ${isOverdue ? '!border-red-200 !bg-red-50/50' : ''}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${cat?.bg ?? 'bg-gray-100'} ${cat?.color ?? 'text-gray-600'}`}>
                      {cat?.label ?? item.category}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {item.vendor && `${item.vendor} \u00B7 `}
                        {item.due_date ? `Due ${item.due_date}` : 'No due date'}
                        {item.assignee_name && ` \u00B7 ${item.assignee_name}`}
                        {item.recurrence !== 'none' && ` \u00B7 ${item.recurrence}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {item.cost != null && (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        {'\u00A3'}{item.cost.toFixed(0)}
                      </span>
                    )}
                    <span className={`text-[11px] font-semibold ${priority?.color ?? 'text-gray-500'}`}>
                      {priority?.label ?? item.priority}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status?.bg ?? 'bg-gray-100'} ${status?.text ?? 'text-gray-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${status?.dot ?? 'bg-gray-400'}`} />
                      {isOverdue ? 'Overdue' : status?.label ?? item.status}
                    </span>
                    <div className="flex gap-1">
                      {item.status === 'pending' && (
                        <button className="btn btn-ghost px-2 py-1 text-[11px]" onClick={() => updateStatus(item.id, 'in_progress')}>Start</button>
                      )}
                      {(item.status === 'pending' || item.status === 'in_progress') && (
                        <button className="btn btn-ghost px-2 py-1 text-[11px] text-emerald-600" onClick={() => updateStatus(item.id, 'completed')}>Done</button>
                      )}
                      <button className="btn btn-ghost px-2 py-1 text-[11px]" onClick={() => startEdit(item)}>Edit</button>
                      {item.status !== 'cancelled' && (
                        <button className="btn btn-ghost px-2 py-1 text-[11px] text-red-600" onClick={() => deleteItem(item.id)}>Cancel</button>
                      )}
                    </div>
                  </div>
                </div>
                {item.description && (
                  <p className="mt-2 truncate border-t border-gray-100 pt-2 text-xs text-gray-500">{item.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)</p>
          <div className="flex gap-1.5">
            <button className="btn btn-ghost py-1.5 text-xs" disabled={pagination.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</button>
            <button className="btn btn-ghost py-1.5 text-xs" disabled={pagination.page >= pagination.total_pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
