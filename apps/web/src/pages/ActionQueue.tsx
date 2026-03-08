import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import { useToast } from '../components/Toast.tsx';
import { useBookingUpdates } from '../context/websocket.tsx';
import type { BookingRow, ApiResponse } from '@studioflow360/shared';
import { STALE_APPROVAL_HOURS, type Platform } from '@studioflow360/shared';

export function ActionQueuePage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchQueue = useCallback(() => {
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
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Live updates
  useBookingUpdates(useCallback(() => {
    fetchQueue();
  }, [fetchQueue]));

  const markActioned = async (id: string) => {
    setActionLoading(id);
    const res = await api.patch(`/bookings/${id}/platform-action`, {});
    if (res.success) toast('Marked as actioned', 'success');
    else toast(res.error?.message ?? 'Failed', 'error');
    fetchQueue();
    setActionLoading(null);
  };

  const isStale = (approvedAt: string | null): boolean => {
    if (!approvedAt) return false;
    const hoursElapsed = (Date.now() - new Date(approvedAt).getTime()) / (1000 * 60 * 60);
    return hoursElapsed > STALE_APPROVAL_HOURS;
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Action Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bookings approved internally that need action on the external platform
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[76px]" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-7 w-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">All caught up!</p>
          <p className="mt-1 text-sm text-gray-500">No bookings pending platform action</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((booking) => {
            const stale = isStale(booking.approved_at);
            return (
              <div
                key={booking.id}
                className={`card-interactive flex items-center justify-between rounded-xl bg-white p-4 ${
                  stale ? '!border-red-200 !bg-red-50/50' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  {stale && (
                    <span className="relative flex h-3 w-3" title="Overdue">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                    </span>
                  )}
                  <PlatformBadge platform={booking.platform as Platform} />
                  <div>
                    <Link to={`/bookings/${booking.id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600">
                      {booking.guest_name}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {booking.platform_ref ? `Ref: ${booking.platform_ref} \u00B7 ` : ''}
                      {booking.booking_date} \u00B7 {booking.start_time}\u2013{booking.end_time}
                    </p>
                  </div>
                </div>
                <button
                  className="btn btn-success"
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
