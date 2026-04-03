import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
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

const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'NEEDS_REVIEW', 'APPROVED', 'PLATFORM_ACTIONED', 'CONFIRMED'];

export function BookingsPage() {
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '' as BookingStatus | '',
    platform: '' as Platform | '',
    date_from: '',
    date_to: '',
    page: 1,
  });

  const fetchBookings = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) {
      params.set('status', filters.status);
    }
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    params.set('page', String(filters.page));
    params.set('per_page', '25');

    api
      .get<BookingListItem[]>(`/bookings?${params}`)
      .then((res: ApiResponse<BookingListItem[]> & { pagination?: PaginatedResponse }) => {
        if (res.success && res.data) {
          // Client-side filter to active only when no specific status is selected
          const data = !filters.status
            ? res.data.filter((b) => ACTIVE_STATUSES.includes(b.status as BookingStatus))
            : res.data;
          setBookings(data);
          if (res.pagination) setPagination(res.pagination);
        }
      })
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useBookingUpdates(useCallback(() => {
    fetchBookings();
  }, [fetchBookings]));

  const grouped = groupByDate(bookings);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Bookings</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total} total` : 'Loading...'}
            {' \u00B7 '}Active bookings across all platforms
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value, page: 1 }))}
            placeholder="From"
          />
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value, page: 1 }))}
          />
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as BookingStatus | '', page: 1 }))}
          >
            <option value="">Active Only</option>
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
          {(filters.status || filters.platform || filters.date_from || filters.date_to) && (
            <button
              className="btn btn-ghost text-xs"
              onClick={() => setFilters({ status: '', platform: '', date_from: '', date_to: '', page: 1 })}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-[76px]" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <p className="text-base font-semibold text-gray-900">No bookings found</p>
          <p className="mt-1 text-sm text-gray-500">
            {filters.status || filters.platform || filters.date_from ? 'Try adjusting your filters.' : 'No active bookings at the moment.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {formatDateHeader(date)}
              </h3>
              <div className="space-y-1.5">
                {items.map((booking) => (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className="card-interactive block rounded-xl bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <PlatformBadge platform={booking.platform} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{booking.guest_name}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {booking.start_time}{'\u2013'}{booking.end_time}
                            {booking.duration_hours ? ` (${booking.duration_hours}h)` : ''}
                            {booking.guest_count ? ` \u00B7 ${booking.guest_count} guests` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
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
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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

function groupByDate(bookings: BookingListItem[]): [string, BookingListItem[]][] {
  const map = new Map<string, BookingListItem[]>();
  for (const b of bookings) {
    const date = b.booking_date;
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(b);
  }
  // Sort groups by date ascending
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
