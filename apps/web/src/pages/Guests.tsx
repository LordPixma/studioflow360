import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';
import { GUEST_TAG_PRESETS } from '@studioflow360/shared';

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  tags: string;
  source: string;
  total_bookings: number;
  total_revenue: number;
  last_booking_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  creator_name: string | null;
}

interface GuestDetail extends Guest {
  notes_list: GuestNote[];
  bookings: GuestBooking[];
}

interface GuestNote {
  id: string;
  note_type: string;
  content: string;
  created_by: string;
  author_name: string | null;
  created_at: string;
}

interface GuestBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  total_price: number | null;
  platform: string;
  room_name: string | null;
}

interface GuestSummary {
  total_guests: number;
  total_bookings: number;
  total_revenue: number;
  vip_count: number;
  corporate_count: number;
  active_last_30d: number;
}

type View = 'list' | 'detail' | 'create';

const NOTE_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Phone Call',
  email: 'Email',
  meeting: 'Meeting',
  follow_up: 'Follow-up',
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  note: 'bg-gray-100 text-gray-700',
  call: 'bg-blue-100 text-blue-700',
  email: 'bg-purple-100 text-purple-700',
  meeting: 'bg-green-100 text-green-700',
  follow_up: 'bg-amber-100 text-amber-700',
};

export function GuestsPage() {
  const { staff } = useAuth();
  const canManage = staff?.permissions?.includes('guests.manage');
  const { toast } = useToast();

  const [view, setView] = useState<View>('list');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [summary, setSummary] = useState<GuestSummary | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sort, setSort] = useState('updated_at');
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [syncing, setSyncing] = useState(false);

  // Create form
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', address: '', notes: '', tags: [] as string[],
  });

  // Note form
  const [noteForm, setNoteForm] = useState({ note_type: 'note', content: '' });

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pagination.page), per_page: '25', sort, order: 'desc' });
    if (search) params.set('search', search);
    if (tagFilter) params.set('tag', tagFilter);

    const res = await api.get<Guest[]>(`/guests?${params}`);
    if (res.success && res.data) {
      setGuests(res.data);
      if (res.pagination) setPagination(p => ({ ...p, total: res.pagination!.total, total_pages: res.pagination!.total_pages }));
    }
    setLoading(false);
  }, [pagination.page, search, tagFilter, sort]);

  const fetchSummary = useCallback(async () => {
    const res = await api.get<GuestSummary>('/guests/summary');
    if (res.success && res.data) setSummary(res.data);
  }, []);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const openDetail = async (id: string) => {
    const res = await api.get<Record<string, unknown>>(`/guests/${id}`);
    if (res.success && res.data) {
      const d = res.data;
      setSelectedGuest({
        ...(d as unknown as Guest),
        notes_list: (d.notes as GuestNote[]) ?? [],
        bookings: (d.bookings as GuestBooking[]) ?? [],
      });
      setView('detail');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ id: string }>('/guests', {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      address: form.address || null,
      notes: form.notes || null,
      tags: form.tags,
    });
    if (res.success) {
      toast('Guest created', 'success');
      setForm({ name: '', email: '', phone: '', company: '', address: '', notes: '', tags: [] });
      setView('list');
      fetchGuests();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const res = await api.post<{ created: number }>('/guests/sync-from-bookings', {});
    if (res.success) {
      toast(`Synced ${res.data?.created ?? 0} guests from bookings`, 'success');
      fetchGuests();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Sync failed', 'error');
    }
    setSyncing(false);
  };

  const handleAddNote = async () => {
    if (!selectedGuest || !noteForm.content.trim()) return;
    const res = await api.post<{ id: string }>(`/guests/${selectedGuest.id}/notes`, noteForm);
    if (res.success) {
      toast('Note added', 'success');
      setNoteForm({ note_type: 'note', content: '' });
      openDetail(selectedGuest.id);
    }
  };

  const handleToggleTag = async (guestId: string, tag: string, currentTags: string[]) => {
    const newTags = currentTags.includes(tag) ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
    const res = await api.patch<{ id: string }>(`/guests/${guestId}`, { tags: newTags });
    if (res.success) {
      fetchGuests();
      if (selectedGuest?.id === guestId) openDetail(guestId);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this guest and all their notes? This cannot be undone.')) return;
    const res = await api.delete<void>(`/guests/${id}`);
    if (res.success) {
      toast('Guest deleted', 'success');
      setView('list');
      fetchGuests();
      fetchSummary();
    }
  };

  const parseTags = (tagsJson: string): string[] => {
    try { return JSON.parse(tagsJson); } catch { return []; }
  };

  const formatCurrency = (v: number | null) => v != null ? `£${v.toFixed(2)}` : '—';
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
            {view === 'detail' ? selectedGuest?.name : view === 'create' ? 'Add Guest' : 'Guests & CRM'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {view === 'list' ? 'Client directory, booking history, and relationship management' : view === 'create' ? 'Add a new guest to your directory' : 'Guest profile and interaction history'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSelectedGuest(null); }} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Back
            </button>
          )}
          {view === 'list' && canManage && (
            <>
              <button onClick={handleSync} disabled={syncing} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {syncing ? 'Syncing...' : 'Sync from Bookings'}
              </button>
              <button onClick={() => setView('create')} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                Add Guest
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {view === 'list' && summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total Guests', value: summary.total_guests },
            { label: 'Total Bookings', value: summary.total_bookings },
            { label: 'Total Revenue', value: formatCurrency(summary.total_revenue) },
            { label: 'VIP Guests', value: summary.vip_count },
            { label: 'Corporate', value: summary.corporate_count },
            { label: 'Active (30d)', value: summary.active_last_30d },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text" placeholder="Search guests..." value={search}
              onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select value={tagFilter} onChange={e => { setTagFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="">All Tags</option>
              {GUEST_TAG_PRESETS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <option value="updated_at">Recently Updated</option>
              <option value="revenue">Top Revenue</option>
              <option value="bookings">Most Bookings</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Guest</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tags</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Bookings</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Last Booking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Loading...</td></tr>
                ) : guests.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    No guests found. {canManage ? 'Click "Sync from Bookings" to import guests from existing bookings.' : ''}
                  </td></tr>
                ) : guests.map(g => {
                  const tags = parseTags(g.tags);
                  return (
                    <tr key={g.id} onClick={() => openDetail(g.id)} className="cursor-pointer transition-colors hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                            {g.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{g.name}</p>
                            {g.company && <p className="text-xs text-gray-500">{g.company}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">{g.email ?? '—'}</p>
                        {g.phone && <p className="text-xs text-gray-400">{g.phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tags.map(t => (
                            <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{g.total_bookings}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(g.total_revenue)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(g.last_booking_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{pagination.total} guests</p>
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

      {/* Create View */}
      {view === 'create' && (
        <form onSubmit={handleCreate} className="mx-auto max-w-2xl space-y-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
              <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Company</label>
              <input type="text" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
            <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tags</label>
            <div className="flex flex-wrap gap-2">
              {GUEST_TAG_PRESETS.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${form.tags.includes(t) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setView('list')} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Create Guest</button>
          </div>
        </form>
      )}

      {/* Detail View */}
      {view === 'detail' && selectedGuest && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: profile */}
          <div className="space-y-4 lg:col-span-1">
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
                  {selectedGuest.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedGuest.name}</h2>
                  {selectedGuest.company && <p className="text-sm text-gray-500">{selectedGuest.company}</p>}
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {selectedGuest.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">Email:</span> {selectedGuest.email}
                  </div>
                )}
                {selectedGuest.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">Phone:</span> {selectedGuest.phone}
                  </div>
                )}
                {selectedGuest.address && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">Address:</span> {selectedGuest.address}
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-gray-400">Source:</span>
                  <span className="capitalize">{selectedGuest.source}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xl font-bold text-gray-900">{selectedGuest.total_bookings}</p>
                  <p className="text-xs text-gray-500">Bookings</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedGuest.total_revenue)}</p>
                  <p className="text-xs text-gray-500">Revenue</p>
                </div>
              </div>

              {/* Tags */}
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {GUEST_TAG_PRESETS.map(t => {
                    const currentTags = parseTags(selectedGuest.tags);
                    const isActive = currentTags.includes(t);
                    return (
                      <button key={t} onClick={() => canManage && handleToggleTag(selectedGuest.id, t, currentTags)}
                        disabled={!canManage}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} ${!canManage ? 'cursor-default' : 'cursor-pointer'}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              {canManage && (
                <div className="mt-4 border-t pt-4">
                  <button onClick={() => handleDelete(selectedGuest.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-700">
                    Delete Guest
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right column: history & notes */}
          <div className="space-y-4 lg:col-span-2">
            {/* Booking History */}
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Booking History</h3>
              {selectedGuest.bookings.length === 0 ? (
                <p className="text-sm text-gray-400">No linked bookings</p>
              ) : (
                <div className="space-y-2">
                  {selectedGuest.bookings.map(b => (
                    <a key={b.id} href={`/bookings/${b.id}`}
                      className="flex items-center justify-between rounded-lg border border-gray-50 p-3 transition-colors hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{b.room_name ?? 'Studio'}</p>
                        <p className="text-xs text-gray-500">{formatDate(b.booking_date)} &middot; {b.start_time}–{b.end_time}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                          b.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                          b.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{b.status}</span>
                        {b.total_price != null && <p className="mt-0.5 text-sm font-medium text-gray-900">{formatCurrency(b.total_price)}</p>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Interaction Notes */}
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Interaction Log</h3>

              {/* Add note form */}
              {canManage && (
                <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <select value={noteForm.note_type} onChange={e => setNoteForm(f => ({ ...f, note_type: e.target.value }))}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium">
                      {Object.entries(NOTE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <textarea rows={2} placeholder="Add a note..." value={noteForm.content}
                    onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))}
                    className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={handleAddNote} disabled={!noteForm.content.trim()}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    Add Note
                  </button>
                </div>
              )}

              {selectedGuest.notes_list.length === 0 ? (
                <p className="text-sm text-gray-400">No interactions logged</p>
              ) : (
                <div className="space-y-3">
                  {selectedGuest.notes_list.map(n => (
                    <div key={n.id} className="rounded-lg border border-gray-50 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${NOTE_TYPE_COLORS[n.note_type] ?? 'bg-gray-100 text-gray-700'}`}>
                          {NOTE_TYPE_LABELS[n.note_type] ?? n.note_type}
                        </span>
                        <span className="text-xs text-gray-400">{n.author_name ?? 'Staff'}</span>
                        <span className="text-xs text-gray-300">&middot;</span>
                        <span className="text-xs text-gray-400">{formatDate(n.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
