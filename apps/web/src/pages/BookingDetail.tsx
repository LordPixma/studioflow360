import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import { useToast } from '../components/Toast.tsx';
import { useBookingUpdates } from '../context/websocket.tsx';
import type { BookingDetail, BookingEventRow, RoomRow } from '@studioflow360/shared';
import { VALID_STATUS_TRANSITIONS, type BookingStatus } from '@studioflow360/shared';

interface StaffListItem {
  id: string;
  display_name: string;
  role: string;
  phone_number?: string | null;
}

interface MessageItem {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: 'sms' | 'whatsapp';
  body: string;
  status: string;
  created_at: string;
}

export function BookingDetailPage() {
  const { id } = useParams();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [staffList, setStaffList] = useState<StaffListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [msgBody, setMsgBody] = useState('');
  const [msgChannel, setMsgChannel] = useState<'sms' | 'whatsapp'>('whatsapp');
  const [msgTo, setMsgTo] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const { toast } = useToast();

  const fetchBooking = useCallback(() => {
    if (!id) return;
    setError(null);
    api.get<BookingDetail>(`/bookings/${id}`).then((res) => {
      if (res.success && res.data) setBooking(res.data);
      else setError(res.error?.message ?? 'Failed to load booking');
      setLoading(false);
    }).catch(() => { setError('Network error'); setLoading(false); });
  }, [id]);

  useEffect(() => {
    fetchBooking();
    api.get<RoomRow[]>('/rooms').then((res) => {
      if (res.success && res.data) setRooms(res.data);
    });
    api.get<StaffListItem[]>('/staff/list').then((res) => {
      if (res.success && res.data) setStaffList(res.data);
    });
    if (id) {
      api.get<MessageItem[]>(`/messaging/booking/${id}`).then((res) => {
        if (res.success && res.data) setMessages(res.data);
      });
    }
  }, [fetchBooking, id]);

  // Live updates
  useBookingUpdates(useCallback((event) => {
    if (event.booking_id === id) {
      fetchBooking();
      toast('Booking updated', 'info');
    }
  }, [id, fetchBooking, toast]));

  const updateStatus = async (newStatus: BookingStatus) => {
    if (!id) return;
    if (newStatus === 'REJECTED' && !confirm('Are you sure you want to reject this booking?')) return;
    if (newStatus === 'CANCELLED' && !confirm('Are you sure you want to cancel this booking?')) return;
    setActionLoading(true);
    const res = await api.patch(`/bookings/${id}/status`, { status: newStatus });
    if (res.success) toast(`Status updated to ${newStatus}`, 'success');
    else toast(res.error?.message ?? 'Failed to update status', 'error');
    fetchBooking();
    setActionLoading(false);
  };

  const assignRoom = async (roomId: string) => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.patch(`/bookings/${id}/room`, { room_id: roomId });
    if (res.success) {
      toast('Room assigned', 'success');
    } else if (res.error?.code === 'CONFLICT') {
      toast(`Conflict: ${res.error.message}`, 'warning');
    } else {
      toast(res.error?.message ?? 'Failed to assign room', 'error');
    }
    fetchBooking();
    setActionLoading(false);
  };

  const markPlatformActioned = async () => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.patch(`/bookings/${id}/platform-action`, {});
    if (res.success) toast('Marked as actioned on platform', 'success');
    else toast(res.error?.message ?? 'Failed to mark actioned', 'error');
    fetchBooking();
    setActionLoading(false);
  };

  const assignStaff = async (staffId: string | null) => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.patch(`/bookings/${id}/assign`, { staff_id: staffId || null });
    if (res.success) toast(staffId ? 'Coordinator assigned' : 'Coordinator unassigned', 'success');
    else toast(res.error?.message ?? 'Failed to assign coordinator', 'error');
    fetchBooking();
    setActionLoading(false);
  };

  const addNote = async () => {
    if (!id || !note.trim()) return;
    setActionLoading(true);
    const res = await api.post(`/bookings/${id}/notes`, { note: note.trim() });
    if (res.success) { setNote(''); toast('Note added', 'success'); }
    else toast(res.error?.message ?? 'Failed to add note', 'error');
    fetchBooking();
    setActionLoading(false);
  };

  const sendMessage = async () => {
    if (!id || !msgBody.trim() || !msgTo.trim()) return;
    setSendingMsg(true);
    const res = await api.post('/messaging/send', {
      booking_id: id,
      channel: msgChannel,
      to_number: msgTo.trim(),
      body: msgBody.trim(),
    });
    if (res.success) {
      setMsgBody('');
      toast(`${msgChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} sent`, 'success');
      // Refresh messages
      api.get<MessageItem[]>(`/messaging/booking/${id}`).then((r) => {
        if (r.success && r.data) setMessages(r.data);
      });
    } else {
      toast(res.error?.message ?? 'Failed to send message', 'error');
    }
    setSendingMsg(false);
  };

  const reExtract = async () => {
    if (!id) return;
    setReExtracting(true);
    const res = await api.post(`/bookings/${id}/re-extract`, {});
    if (res.success) {
      const data = res.data as { fields_updated?: number; confidence?: number };
      toast(`Re-extraction successful — ${data.fields_updated ?? 0} fields updated (confidence: ${((data.confidence ?? 0) * 100).toFixed(0)}%)`, 'success');
      fetchBooking();
    } else {
      toast(res.error?.message ?? 'Re-extraction failed', 'error');
    }
    setReExtracting(false);
  };

  const updateChatLink = async (link: string) => {
    if (!id) return;
    await api.patch(`/messaging/booking/${id}/chat-link`, { external_chat_link: link || null });
    fetchBooking();
    toast('Chat link updated', 'success');
  };

  if (loading) {
    return <div className="skeleton h-96" />;
  }

  if (error || !booking) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-900">{error ?? 'Booking not found'}</p>
        <Link to="/inbox" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">Back to Inbox</Link>
      </div>
    );
  }

  const availableTransitions = VALID_STATUS_TRANSITIONS[booking.status] ?? [];
  const btnStyle: Record<string, string> = {
    APPROVED: 'btn-primary', REJECTED: 'btn-danger', CONFIRMED: 'btn-success',
    CANCELLED: 'btn-ghost', PENDING: 'btn-warning', PLATFORM_ACTIONED: 'btn-warning',
    NEEDS_REVIEW: 'btn-warning',
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3 sm:gap-4">
        <Link to="/inbox" className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </Link>
        <div className="hidden sm:block h-5 w-px bg-gray-300" />
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">Booking Detail</h1>
        <div className="flex items-center gap-2">
          <PlatformBadge platform={booking.platform} />
          <StatusBadge status={booking.status} />
        </div>
      </div>

      {/* Manual action banner */}
      {booking.status === 'APPROVED' && !booking.platform_actioned && booking.platform !== 'direct' && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
              <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-orange-800">Action Required</p>
              <p className="text-xs text-orange-600">Accept/reject this booking on {booking.platform}</p>
            </div>
          </div>
          <button className="btn btn-warning" onClick={markPlatformActioned} disabled={actionLoading}>
            Mark Actioned
          </button>
        </div>
      )}

      {/* AI extraction failed banner */}
      {booking.guest_name?.includes('AI extraction failed') && booking.raw_email_r2_key && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">AI Extraction Failed</p>
              <p className="text-xs text-red-600">The original email contains booking data that wasn't extracted. Click to retry with improved extraction.</p>
            </div>
          </div>
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={reExtract}
            disabled={reExtracting}
          >
            {reExtracting ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Extracting...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Re-extract
              </>
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: Booking details — wider */}
        <div className="min-w-0 space-y-5 lg:col-span-3">
          {/* Guest info card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Guest Information</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <dt className="text-xs text-gray-400">Guest Name</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">{booking.guest_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Guest Email</dt>
                <dd className="mt-0.5 truncate font-medium text-gray-700">{booking.guest_email ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Date</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">{booking.booking_date}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Time</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">{booking.start_time} – {booking.end_time}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Duration</dt>
                <dd className="mt-0.5 font-medium text-gray-700">{booking.duration_hours ?? '\u2014'} hours</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Guest Count</dt>
                <dd className="mt-0.5 font-medium text-gray-700">{booking.guest_count ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Price</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">
                  {booking.total_price != null
                    ? `${booking.currency === 'GBP' ? '\u00A3' : booking.currency ?? '\u00A3'}${booking.total_price.toFixed(2)}`
                    : '\u2014'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Platform Ref</dt>
                <dd className="mt-0.5 truncate font-medium text-gray-700">{booking.platform_ref ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">AI Confidence</dt>
                <dd className="mt-0.5">
                  {booking.ai_confidence != null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full ${booking.ai_confidence >= 0.7 ? 'bg-emerald-500' : booking.ai_confidence >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${booking.ai_confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600">{(booking.ai_confidence * 100).toFixed(0)}%</span>
                    </div>
                  ) : '\u2014'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">Payment</dt>
                <dd className="mt-0.5">
                  {(() => {
                    const ps = (booking as unknown as Record<string, unknown>).payment_status as string | null;
                    if (!ps || ps === 'unpaid') return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" />Unpaid</span>;
                    if (ps === 'pending') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Pending</span>;
                    if (ps === 'paid') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Paid{(booking as unknown as Record<string, unknown>).amount_paid != null ? ` — \u00A3${Number((booking as unknown as Record<string, unknown>).amount_paid).toFixed(2)}` : ''}</span>;
                    if (ps === 'refunded') return <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700"><span className="h-1.5 w-1.5 rounded-full bg-purple-500" />Refunded</span>;
                    if (ps === 'failed') return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Failed</span>;
                    return <span className="text-sm text-gray-500">{ps}</span>;
                  })()}
                </dd>
              </div>
              {booking.notes && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-400">Guest Notes</dt>
                  <dd className="mt-0.5 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{booking.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Room + Coordinator + Actions row */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Room Assignment</h3>
              <select
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm shadow-sm"
                value={booking.room_id ?? ''}
                onChange={(e) => e.target.value && assignRoom(e.target.value)}
                disabled={actionLoading}
              >
                <option value="">Select a room...</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} (cap: {room.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Coordinator</h3>
              <select
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm shadow-sm"
                value={booking.assigned_to ?? ''}
                onChange={(e) => assignStaff(e.target.value || null)}
                disabled={actionLoading}
              >
                <option value="">Unassigned</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name} ({s.role})
                  </option>
                ))}
              </select>
              {booking.assigned_staff && (
                <p className="mt-2 text-[11px] text-gray-400">
                  Currently: {(booking.assigned_staff as { display_name?: string }).display_name}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {availableTransitions.map((status) => (
                  <button
                    key={status}
                    className={`btn ${btnStyle[status] ?? 'btn-ghost'}`}
                    onClick={() => updateStatus(status)}
                    disabled={actionLoading}
                  >
                    {status === 'PLATFORM_ACTIONED' ? 'Mark Actioned' : status === 'PENDING' && booking.status === 'APPROVED' ? 'Unapprove' : status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
                  </button>
                ))}
                {booking.raw_email_r2_key && (
                  <button
                    className="btn btn-ghost flex items-center gap-1.5"
                    onClick={reExtract}
                    disabled={reExtracting}
                  >
                    <svg className={`h-3.5 w-3.5 ${reExtracting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                    {reExtracting ? 'Extracting...' : 'Re-extract'}
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    setActionLoading(true);
                    const res = await api.post(`/invoices/from-booking/${id}`, {});
                    if (res.success) toast('Invoice generated', 'success');
                    else toast(res.error?.message ?? 'Failed to generate invoice', 'error');
                    setActionLoading(false);
                  }}
                  disabled={actionLoading}
                >
                  Generate Invoice
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Staff Notes</h3>
            {booking.staff_notes && (
              <pre className="mb-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{booking.staff_notes}</pre>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm shadow-sm"
                placeholder="Add a note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
              />
              <button className="btn btn-primary" onClick={addNote} disabled={actionLoading || !note.trim()}>
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Right: Messaging + Raw email + Audit trail */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* Customer Chat & Messaging */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Customer Communication</h3>

            {/* External chat link */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500">External Chat Link</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="url"
                  placeholder="https://wa.me/44..."
                  defaultValue={booking.external_chat_link ?? ''}
                  onBlur={(e) => updateChatLink(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                />
                {booking.external_chat_link && (
                  <a
                    href={booking.external_chat_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost text-xs"
                  >
                    Open
                  </a>
                )}
              </div>
            </div>

            {/* Send message form */}
            <div className="border-t border-gray-100 pt-4">
              <div className="mb-3 flex gap-2">
                <select
                  value={msgChannel}
                  onChange={(e) => setMsgChannel(e.target.value as 'sms' | 'whatsapp')}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
                <input
                  type="tel"
                  placeholder="To: +44..."
                  value={msgTo}
                  onChange={(e) => setMsgTo(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  placeholder="Type a message..."
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                />
                <button
                  className="btn btn-primary self-end px-4"
                  onClick={sendMessage}
                  disabled={sendingMsg || !msgBody.trim() || !msgTo.trim()}
                >
                  {sendingMsg ? '...' : 'Send'}
                </button>
              </div>
            </div>

            {/* Message history */}
            {messages.length > 0 && (
              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto border-t border-gray-100 pt-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl px-3 py-2 text-xs ${
                      msg.direction === 'outbound'
                        ? 'ml-4 bg-blue-50 text-blue-800'
                        : 'mr-4 bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{msg.channel}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-1">{msg.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {booking.raw_email_r2_key && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Original Email</h3>
              <iframe
                src={`/api/bookings/${booking.id}/raw-email`}
                sandbox=""
                className="h-80 w-full rounded-lg border border-gray-100 bg-gray-50"
                title="Original booking email"
              />
            </div>
          )}

          {/* Audit trail */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Audit Trail</h3>
            {(booking.events ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No events recorded yet.</p>
            ) : (
              <div className="relative space-y-0">
                <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gray-200" />
                {(booking.events ?? []).map((event: BookingEventRow & { actor_name?: string }) => {
                  const colors: Record<string, string> = {
                    RECEIVED: 'bg-gray-300', PARSED: 'bg-blue-400', ASSIGNED: 'bg-indigo-400',
                    APPROVED: 'bg-emerald-400', REJECTED: 'bg-red-400', PLATFORM_ACTIONED: 'bg-orange-400',
                    CONFIRMED: 'bg-emerald-500', CANCELLED: 'bg-gray-400', NOTE_ADDED: 'bg-amber-400',
                  };
                  return (
                    <div key={event.id} className="relative flex items-start gap-3 py-2.5 text-sm">
                      <div className={`relative z-10 mt-0.5 h-3.5 w-3.5 rounded-full ring-4 ring-white ${colors[event.event_type] ?? 'bg-gray-300'}`} />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-800">{event.event_type.replace(/_/g, ' ')}</p>
                        <p className="text-[11px] text-gray-400">
                          {event.actor_name ?? 'System'} \u00B7{' '}
                          {new Date(event.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
