import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import type { BookingRow, ApiResponse } from '@studioflow360/shared';
import { STALE_APPROVAL_HOURS, type Platform } from '@studioflow360/shared';

export function ActionQueuePage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchQueue = () => {
    setLoading(true);
    api
      .get<BookingRow[]>('/bookings?status=APPROVED')
      .then((res: ApiResponse<BookingRow[]>) => {
        if (res.success && res.data) {
          // Filter to only non-direct, non-platform-actioned
          setBookings(res.data.filter((b) => b.platform !== 'direct' && !b.platform_actioned));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const markActioned = async (id: string) => {
    setActionLoading(id);
    await api.patch(`/bookings/${id}/platform-action`, {});
    fetchQueue();
    setActionLoading(null);
  };

  const isStale = (approvedAt: string | null): boolean => {
    if (!approvedAt) return false;
    const hoursElapsed = (Date.now() - new Date(approvedAt).getTime()) / (1000 * 60 * 60);
    return hoursElapsed > STALE_APPROVAL_HOURS;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Action Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bookings that need to be accepted/rejected on the external platform
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-lg font-medium text-gray-900">All caught up!</p>
          <p className="mt-1 text-gray-500">No bookings pending platform action</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const stale = isStale(booking.approved_at);
            return (
              <div
                key={booking.id}
                className={`flex items-center justify-between rounded-lg border bg-white p-4 ${
                  stale ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-4">
                  {stale && (
                    <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" title="Overdue — approved more than 2 hours ago" />
                  )}
                  <PlatformBadge platform={booking.platform as Platform} />
                  <div>
                    <Link to={`/bookings/${booking.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {booking.guest_name}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {booking.platform_ref ? `Ref: ${booking.platform_ref} · ` : ''}
                      {booking.booking_date} · {booking.start_time}–{booking.end_time}
                    </p>
                  </div>
                </div>
                <button
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  onClick={() => markActioned(booking.id)}
                  disabled={actionLoading === booking.id}
                >
                  {actionLoading === booking.id ? 'Marking...' : 'Mark Actioned'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
