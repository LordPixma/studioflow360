import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
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

export function InboxPage() {
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '' as BookingStatus | '',
    platform: '' as Platform | '',
    page: 1,
  });

  useEffect(() => {
    setLoading(true);
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
        }
      })
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Unified Inbox</h1>
        <div className="flex gap-3">
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as BookingStatus | '', page: 1 }))}
          >
            <option value="">All Statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value as Platform | '', page: 1 }))}
          >
            <option value="">All Platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-gray-500">No bookings found</p>
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
                      {booking.platform_ref ? `Ref: ${booking.platform_ref} · ` : ''}
                      {booking.booking_date} · {booking.start_time}–{booking.end_time}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                    <span className="text-amber-500" title="Needs manual review">
                      &#9888;
                    </span>
                  )}
                </div>
              </div>
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
