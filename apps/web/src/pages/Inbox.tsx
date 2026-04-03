import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import { useToast } from '../components/Toast.tsx';
import { useBookingUpdates } from '../context/websocket.tsx';
import type { BookingRow, ApiResponse, RoomRow } from '@studioflow360/shared';
import { BOOKING_STATUSES, PLATFORMS, type BookingStatus, type Platform } from '@studioflow360/shared';

interface BookingListItem extends BookingRow {
  room_name?: string;
  room_color?: string;
}

interface PaginatedResponse {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const emptyForm = {
  guest_name: '',
  guest_email: '',
  booking_date: new Date().toISOString().slice(0, 10),
  start_time: '10:00',
  end_time: '11:00',
  guest_count: 1,
  total_price: '',
  notes: '',
  room_id: '',
};

export function InboxPage() {
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    status: '' as BookingStatus | '',
    platform: '' as Platform | '',
    page: 1,
  });
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [newBooking, setNewBooking] = useState(emptyForm);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchBookings = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.platform) params.set('platform', filters.platform);
    params.set('page', String(filters.page));

    api
      .get<BookingListItem[]>(`/bookings?${params}`)
      .then((res: ApiResponse<BookingListItem[]> & { pagination?: PaginatedResponse }) => {
        if (res.success && res.data) {
          setBookings(res.data);
          if (res.pagination) setPagination(res.pagination);
        } else {
          setError(res.error?.message ?? 'Failed to load bookings');
        }
      })
      .catch(() => setError('Network error — please try again'))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Live updates via WebSocket
  useBookingUpdates(useCallback(() => {
    fetchBookings();
    toast('New booking update received', 'info');
  }, [fetchBookings, toast]));

  // Fetch rooms for the new booking form
  useEffect(() => {
    api.get<RoomRow[]>('/rooms').then((res) => {
      if (res.success && res.data) setRooms(res.data);
    });
  }, []);

  const submitNewBooking = async () => {
    if (!newBooking.guest_name.trim()) { toast('Guest name is required', 'warning'); return; }
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      guest_name: newBooking.guest_name.trim(),
      booking_date: newBooking.booking_date,
      start_time: newBooking.start_time,
      end_time: newBooking.end_time,
    };
    if (newBooking.guest_email.trim()) payload.guest_email = newBooking.guest_email.trim();
    if (newBooking.guest_count > 0) payload.guest_count = newBooking.guest_count;
    if (newBooking.total_price !== '') payload.total_price = Number(newBooking.total_price);
    if (newBooking.notes.trim()) payload.notes = newBooking.notes.trim();
    if (newBooking.room_id) payload.room_id = newBooking.room_id;

    const res = await api.post('/bookings', payload);
    if (res.success) {
      toast('Booking created', 'success');
      setShowNewBooking(false);
      setNewBooking(emptyForm);
      fetchBookings();
    } else {
      toast(res.error?.message ?? 'Failed to create booking', 'error');
    }
    setSubmitting(false);
  };

  const pendingCount = bookings.filter((b) => b.status === 'PENDING' || b.status === 'NEEDS_REVIEW').length;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total} booking${pagination.total !== 1 ? 's' : ''}` : 'Loading...'}
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                {pendingCount} needs attention
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as BookingStatus | '', page: 1 }))}
          >
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value as Platform | '', page: 1 }))}
          >
            <option value="">All Platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <button
            className={`btn ${showNewBooking ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setShowNewBooking(!showNewBooking)}
          >
            {showNewBooking ? 'Cancel' : '+ New Booking'}
          </button>
        </div>
      </div>

      {/* New Booking Form */}
      {showNewBooking && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Walk-in / Manual Booking</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Name *</label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                placeholder="e.g. John Smith"
                value={newBooking.guest_name}
                onChange={(e) => setNewBooking((f) => ({ ...f, guest_name: e.target.value }))}
              />
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guest Email</label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                type="email"
                placeholder="Optional"
                value={newBooking.guest_email}
                onChange={(e) => setNewBooking((f) => ({ ...f, guest_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Date</label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                type="date"
                value={newBooking.booking_date}
                onChange={(e) => setNewBooking((f) => ({ ...f, booking_date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Start</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  type="time"
                  value={newBooking.start_time}
                  onChange={(e) => setNewBooking((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium text-gray-500">End</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  type="time"
                  value={newBooking.end_time}
                  onChange={(e) => setNewBooking((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Guests</label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                type="number"
                min={1}
                value={newBooking.guest_count}
                onChange={(e) => setNewBooking((f) => ({ ...f, guest_count: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">{'\u00A3'} Price</label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                type="number"
                step="0.01"
                placeholder="Optional"
                value={newBooking.total_price}
                onChange={(e) => setNewBooking((f) => ({ ...f, total_price: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Room</label>
              <select
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                value={newBooking.room_id}
                onChange={(e) => setNewBooking((f) => ({ ...f, room_id: e.target.value }))}
              >
                <option value="">Select room...</option>
                {rooms.filter((r) => r.active).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Notes</label>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                placeholder="Optional"
                value={newBooking.notes}
                onChange={(e) => setNewBooking((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn btn-success" onClick={submitNewBooking} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Booking'}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button className="btn btn-danger mt-4" onClick={fetchBookings}>Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-[76px]" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">Inbox is empty</p>
          <p className="mt-1 text-sm text-gray-500">
            {filters.status || filters.platform ? 'No bookings match your filters.' : 'New bookings will appear here when they arrive.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((booking) => (
            <Link
              key={booking.id}
              to={`/bookings/${booking.id}`}
              className={`card-interactive block rounded-xl bg-white p-4 ${
                booking.status === 'NEEDS_REVIEW' ? '!border-orange-200 !bg-orange-50/50' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformBadge platform={booking.platform} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{booking.guest_name}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {booking.platform_ref ? `${booking.platform_ref} \u00B7 ` : ''}
                      {booking.booking_date} \u00B7 {booking.start_time}\u2013{booking.end_time}
                      {booking.duration_hours ? ` (${booking.duration_hours}h)` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="hidden sm:inline text-[11px] text-gray-400">{timeAgo(booking.created_at)}</span>
                  {booking.total_price != null && (
                    <span className="hidden sm:inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {booking.currency === 'GBP' ? '\u00A3' : booking.currency ?? '\u00A3'}{booking.total_price.toFixed(0)}
                    </span>
                  )}
                  {booking.room_name && (
                    <span
                      className="hidden md:inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: booking.room_color ?? '#6B7280' }}
                    >
                      {booking.room_name}
                    </span>
                  )}
                  <StatusBadge status={booking.status} />
                </div>
              </div>
              {booking.notes && (
                <p className="mt-2 truncate border-t border-gray-100 pt-2 text-xs text-gray-500">{booking.notes}</p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
          </p>
          <div className="flex gap-1.5">
            <button
              className="btn btn-ghost py-1.5 text-xs"
              disabled={pagination.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </button>
            <button
              className="btn btn-ghost py-1.5 text-xs"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
