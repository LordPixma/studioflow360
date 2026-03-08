import { useEffect, useState } from 'react';

interface PublicRoom {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  hourly_rate: number;
  color_hex: string;
}

interface BookedSlot {
  room_id: string;
  start_time: string;
  end_time: string;
}

const API_BASE = '/api';

export function PublicBookingPage() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<PublicRoom | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]!);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    guest_name: '', guest_email: '', start_time: '09:00', end_time: '10:00',
    guest_count: 1, notes: '', turnstile_token: '',
  });

  useEffect(() => {
    fetch(`${API_BASE}/public/rooms`).then(r => r.json()).then((res: { success: boolean; data?: PublicRoom[] }) => {
      if (res.success && res.data) setRooms(res.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedRoom || !selectedDate) return;
    fetch(`${API_BASE}/public/availability?date=${selectedDate}&room_id=${selectedRoom.id}`)
      .then(r => r.json())
      .then((res: { success: boolean; data?: BookedSlot[] }) => {
        if (res.success && res.data) setBookedSlots(res.data);
      });
  }, [selectedRoom, selectedDate]);

  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00 - 22:00

  const isSlotBooked = (hour: number) => {
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    const nextTimeStr = `${String(hour + 1).padStart(2, '0')}:00`;
    return bookedSlots.some(slot => slot.start_time < nextTimeStr && slot.end_time > timeStr);
  };

  const submitBooking = async () => {
    if (!selectedRoom || !form.guest_name.trim() || !form.guest_email.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/bookings/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: form.guest_name,
          guest_email: form.guest_email,
          booking_date: selectedDate,
          start_time: form.start_time,
          end_time: form.end_time,
          guest_count: form.guest_count,
          notes: form.notes || undefined,
          room_id: selectedRoom.id,
          turnstile_token: form.turnstile_token || 'dev-bypass',
        }),
      });
      const data = await res.json() as { success: boolean; error?: { message: string } };
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error?.message ?? 'Booking failed');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="skeleton h-96" />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Booking Submitted!</h2>
          <p className="mt-2 text-gray-500">We'll review your request and get back to you shortly.</p>
          <button className="mt-6 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700" onClick={() => { setSuccess(false); setSelectedRoom(null); }}>
            Book Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Book a Studio</h1>
              <p className="text-sm text-gray-500">Select a room and choose your preferred time slot</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {!selectedRoom ? (
          /* Room Selection */
          <div>
            <h2 className="mb-6 text-lg font-semibold text-gray-900">Available Rooms</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rooms.map(room => (
                <div
                  key={room.id}
                  className="cursor-pointer rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  onClick={() => setSelectedRoom(room)}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-4 w-4 rounded" style={{ backgroundColor: room.color_hex }} />
                    <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
                  </div>
                  {room.description && <p className="mb-4 text-sm text-gray-500">{room.description}</p>}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Up to {room.capacity} guests</span>
                    <span className="font-bold text-gray-900">{'\u00A3'}{room.hourly_rate}/hr</span>
                  </div>
                </div>
              ))}
            </div>
            {rooms.length === 0 && (
              <p className="py-12 text-center text-gray-400">No rooms are currently available for booking.</p>
            )}
          </div>
        ) : (
          /* Booking Form */
          <div>
            <button className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700" onClick={() => setSelectedRoom(null)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to rooms
            </button>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
              {/* Room Info */}
              <div className="lg:col-span-2">
                <div className="sticky top-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-5 w-5 rounded" style={{ backgroundColor: selectedRoom.color_hex }} />
                    <h2 className="text-lg font-bold text-gray-900">{selectedRoom.name}</h2>
                  </div>
                  {selectedRoom.description && <p className="mb-4 text-sm text-gray-500">{selectedRoom.description}</p>}
                  <div className="mb-6 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Capacity</span><span className="font-medium">{selectedRoom.capacity} guests</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-bold">{'\u00A3'}{selectedRoom.hourly_rate}/hr</span></div>
                  </div>

                  {/* Availability Grid */}
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Availability for {selectedDate}</h3>
                  <div className="grid grid-cols-5 gap-1.5">
                    {hours.map(h => {
                      const booked = isSlotBooked(h);
                      return (
                        <div
                          key={h}
                          className={`rounded-md px-1.5 py-1.5 text-center text-[11px] font-medium ${
                            booked ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {String(h).padStart(2, '0')}:00
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-200" /> Available</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-200" /> Booked</span>
                  </div>
                </div>
              </div>

              {/* Booking Form */}
              <div className="lg:col-span-3">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-6 text-lg font-bold text-gray-900">Your Details</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Full Name *</label>
                        <input className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" placeholder="John Smith" value={form.guest_name} onChange={(e) => setForm(f => ({ ...f, guest_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                        <input className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" type="email" placeholder="john@example.com" value={form.guest_email} onChange={(e) => setForm(f => ({ ...f, guest_email: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Date *</label>
                      <input className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" type="date" value={selectedDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setSelectedDate(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Start Time *</label>
                        <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" value={form.start_time} onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))}>
                          {hours.map(h => <option key={h} value={`${String(h).padStart(2, '0')}:00`}>{String(h).padStart(2, '0')}:00</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">End Time *</label>
                        <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))}>
                          {hours.map(h => <option key={h + 1} value={`${String(h + 1).padStart(2, '0')}:00`}>{String(h + 1).padStart(2, '0')}:00</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Number of Guests</label>
                      <input className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" type="number" min={1} max={selectedRoom.capacity} value={form.guest_count} onChange={(e) => setForm(f => ({ ...f, guest_count: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
                      <textarea className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" rows={3} placeholder="Any special requirements..." value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>

                    {error && <p className="text-sm font-medium text-red-600">{error}</p>}

                    <div className="rounded-lg bg-blue-50 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Estimated cost</span>
                        <span className="text-lg font-bold text-gray-900">
                          {'\u00A3'}{(() => {
                            const sh = parseInt(form.start_time.split(':')[0]!, 10);
                            const eh = parseInt(form.end_time.split(':')[0]!, 10);
                            const hrs = Math.max(0, eh - sh);
                            return (hrs * selectedRoom.hourly_rate).toFixed(0);
                          })()}
                        </span>
                      </div>
                    </div>

                    <button
                      className="w-full rounded-lg bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                      onClick={submitBooking}
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting...' : 'Request Booking'}
                    </button>
                    <p className="text-center text-[11px] text-gray-400">
                      Bookings are subject to confirmation. You will receive an email once approved.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
