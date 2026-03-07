import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import { useToast } from '../components/Toast.tsx';
import { useBookingUpdates } from '../context/websocket.tsx';
import type { BookingRow, ApiResponse } from '@studioflow360/shared';
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

  const pendingCount = bookings.filter((b) => b.status === 'PENDING' || b.status === 'NEEDS_REVIEW').length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unified Inbox</h1>
          {pagination && (
            <p className="mt-1 text-sm text-gray-500">
              {pagination.total} booking{pagination.total !== 1 ? 's' : ''}
              {pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {pendingCount} needs attention
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as BookingStatus | '', page: 1 }))}
          >
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value as Platform | '', page: 1 }))}
          >
            <option value="">All Platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-800">{error}</p>
          <button className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={fetchBookings}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="mt-4 text-lg font-medium text-gray-900">Inbox is empty</p>
          <p className="mt-1 text-sm text-gray-500">
            {filters.status || filters.platform ? 'No bookings match your filters.' : 'New bookings will appear here when they arrive.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Link
              key={booking.id}
              to={`/bookings/${booking.id}`}
              className={`block rounded-lg border bg-white p-4 transition-shadow hover:shadow-md ${
                booking.status === 'NEEDS_REVIEW'
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PlatformBadge platform={booking.platform} />
                  <div>
                    <p className="font-medium text-gray-900">{booking.guest_name}</p>
                    <p className="text-sm text-gray-500">
                      {booking.platform_ref ? `${booking.platform_ref} · ` : ''}
                      {booking.booking_date} · {booking.start_time}–{booking.end_time}
                      {booking.duration_hours ? ` (${booking.duration_hours}h)` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{timeAgo(booking.created_at)}</span>
                  {booking.total_price != null && (
                    <span className="text-sm font-medium text-gray-700">
                      {booking.currency ?? 'GBP'} {booking.total_price.toFixed(0)}
                    </span>
                  )}
                  {booking.room_name && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: booking.room_color ?? '#6B7280' }}
                    >
                      {booking.room_name}
                    </span>
                  )}
                  <StatusBadge status={booking.status} />
                  {booking.status === 'NEEDS_REVIEW' && (
                    <span className="text-amber-500" title="Low AI confidence — needs manual review">
                      &#9888;
                    </span>
                  )}
                </div>
              </div>
              {booking.notes && (
                <p className="mt-2 truncate text-sm text-gray-500">{booking.notes}</p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} bookings)
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
              disabled={pagination.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </button>
            <button
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
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
