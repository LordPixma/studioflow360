import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import type { BookingDetail, BookingEventRow, RoomRow } from '@studioflow360/shared';
import { VALID_STATUS_TRANSITIONS, type BookingStatus } from '@studioflow360/shared';

export function BookingDetailPage() {
  const { id } = useParams();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBooking = () => {
    if (!id) return;
    api.get<BookingDetail>(`/bookings/${id}`).then((res) => {
      if (res.success && res.data) setBooking(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchBooking();
    api.get<RoomRow[]>('/rooms').then((res) => {
      if (res.success && res.data) setRooms(res.data);
    });
  }, [id]);

  const updateStatus = async (newStatus: BookingStatus) => {
    if (!id) return;
    setActionLoading(true);
    await api.patch(`/bookings/${id}/status`, { status: newStatus });
    fetchBooking();
    setActionLoading(false);
  };

  const assignRoom = async (roomId: string) => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.patch(`/bookings/${id}/room`, { room_id: roomId });
    if (!res.success && res.error?.code === 'CONFLICT') {
      alert(`Conflict: ${res.error.message}`);
    }
    fetchBooking();
    setActionLoading(false);
  };

  const markPlatformActioned = async () => {
    if (!id) return;
    setActionLoading(true);
    await api.patch(`/bookings/${id}/platform-action`, {});
    fetchBooking();
    setActionLoading(false);
  };

  const addNote = async () => {
    if (!id || !note.trim()) return;
    setActionLoading(true);
    await api.post(`/bookings/${id}/notes`, { note: note.trim() });
    setNote('');
    fetchBooking();
    setActionLoading(false);
  };

  if (loading) {
    return <div className="h-96 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!booking) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Booking not found</p>
        <Link to="/inbox" className="mt-4 text-blue-600 hover:underline">Back to Inbox</Link>
      </div>
    );
  }

  const availableTransitions = VALID_STATUS_TRANSITIONS[booking.status] ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link to="/inbox" className="text-gray-500 hover:text-gray-700">&larr; Back</Link>
        <h1 className="text-2xl font-bold text-gray-900">Booking Detail</h1>
      </div>

      {/* Manual action banner */}
      {booking.status === 'APPROVED' && !booking.platform_actioned && booking.platform !== 'direct' && (
        <div className="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
          <p className="font-medium text-orange-800">
            Action Required: Accept/reject this booking on {booking.platform}
          </p>
          <button
            className="mt-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            onClick={markPlatformActioned}
            disabled={actionLoading}
          >
            Mark Platform Actioned
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Booking details */}
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <PlatformBadge platform={booking.platform} />
              <StatusBadge status={booking.status} />
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Guest Name</dt>
                <dd className="font-medium">{booking.guest_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Guest Email</dt>
                <dd className="font-medium">{booking.guest_email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Date</dt>
                <dd className="font-medium">{booking.booking_date}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Time</dt>
                <dd className="font-medium">{booking.start_time} – {booking.end_time}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Duration</dt>
                <dd className="font-medium">{booking.duration_hours ?? '—'} hours</dd>
              </div>
              <div>
                <dt className="text-gray-500">Guest Count</dt>
                <dd className="font-medium">{booking.guest_count ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Price</dt>
                <dd className="font-medium">
                  {booking.total_price != null
                    ? `${booking.currency ?? 'GBP'} ${booking.total_price.toFixed(2)}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Platform Ref</dt>
                <dd className="font-medium">{booking.platform_ref ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">AI Confidence</dt>
                <dd className="font-medium">
                  {booking.ai_confidence != null
                    ? `${(booking.ai_confidence * 100).toFixed(0)}%`
                    : '—'}
                </dd>
              </div>
              {booking.notes && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Guest Notes</dt>
                  <dd className="font-medium">{booking.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Room assignment */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-3 font-medium text-gray-900">Room Assignment</h3>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={booking.room_id ?? ''}
              onChange={(e) => e.target.value && assignRoom(e.target.value)}
              disabled={actionLoading}
            >
              <option value="">Select a room...</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} (capacity: {room.capacity})
                </option>
              ))}
            </select>
          </div>

          {/* Status actions */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-3 font-medium text-gray-900">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {availableTransitions.map((status) => (
                <button
                  key={status}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    status === 'APPROVED' ? 'bg-blue-600 hover:bg-blue-700' :
                    status === 'REJECTED' ? 'bg-red-600 hover:bg-red-700' :
                    status === 'CONFIRMED' ? 'bg-green-600 hover:bg-green-700' :
                    status === 'CANCELLED' ? 'bg-gray-600 hover:bg-gray-700' :
                    'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  onClick={() => updateStatus(status)}
                  disabled={actionLoading}
                >
                  {status === 'PLATFORM_ACTIONED' ? 'Mark Actioned' : status}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-3 font-medium text-gray-900">Staff Notes</h3>
            {booking.staff_notes && (
              <pre className="mb-4 whitespace-pre-wrap text-sm text-gray-700">{booking.staff_notes}</pre>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Add a note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
              />
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={addNote}
                disabled={actionLoading || !note.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Right: Raw email + Audit trail */}
        <div className="space-y-6">
          {booking.raw_email_r2_key && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-3 font-medium text-gray-900">Original Email</h3>
              <iframe
                src={`/api/bookings/${booking.id}/raw-email`}
                sandbox=""
                className="h-96 w-full rounded border border-gray-200"
                title="Original booking email"
              />
            </div>
          )}

          {/* Audit trail */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-3 font-medium text-gray-900">Audit Trail</h3>
            <div className="space-y-3">
              {(booking.events ?? []).map((event: BookingEventRow & { actor_name?: string }) => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">{event.event_type}</p>
                    <p className="text-gray-500">
                      {event.actor_name ?? 'System'} &middot;{' '}
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
