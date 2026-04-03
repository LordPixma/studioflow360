import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router';

interface PublicRoom {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  hourly_rate: number;
  evening_hourly_rate: number | null;
  evening_start_hour: number;
  color_hex: string;
  image_url: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface AvailabilityData {
  booked: Array<{ room_id: string; start_time: string; end_time: string }>;
  slots: TimeSlot[];
  operating_hours: { open: string; close: string };
}

const API_BASE = '/api';

// Steps: 1=Room, 2=DateTime, 3=Details, 4=Confirm
type Step = 1 | 2 | 3 | 4;

function getNextDays(count: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d.toISOString().split('T')[0]!);
  }
  return days;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (dateStr === today.toISOString().split('T')[0]) return 'Today';
  if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDayLabel(dateStr: string): { day: string; weekday: string; month: string } {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    day: String(d.getDate()),
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

export function PublicBookingPage() {
  const [step, setStep] = useState<Step>(1);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<PublicRoom | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]!);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    guest_name: '', guest_email: '', guest_phone: '', guest_count: 1, notes: '',
  });
  const turnstileRef = useRef<HTMLDivElement>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const location = useLocation();
  const isEmbed = location.pathname === '/embed';

  const availableDays = getNextDays(14);

  // Fetch rooms
  useEffect(() => {
    fetch(`${API_BASE}/public/rooms`).then(r => r.json()).then((res: { success: boolean; data?: PublicRoom[] }) => {
      if (res.success && res.data) setRooms(res.data);
      setLoadingRooms(false);
    });
  }, []);

  // Fetch availability when date or room changes
  const fetchAvailability = useCallback(() => {
    if (!selectedRoom || !selectedDate) return;
    setLoadingSlots(true);
    fetch(`${API_BASE}/public/availability?date=${selectedDate}&room_id=${selectedRoom.id}`)
      .then(r => r.json())
      .then((res: { success: boolean; data?: AvailabilityData }) => {
        if (res.success && res.data) setAvailability(res.data);
        setLoadingSlots(false);
      });
  }, [selectedRoom, selectedDate]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  // Load Turnstile widget when reaching step 3
  useEffect(() => {
    if (step !== 3 || !turnstileRef.current) return;
    const win = window as unknown as Record<string, unknown>;
    const siteKey = win.__TURNSTILE_SITE_KEY as string;
    if (!siteKey || siteKey === '') {
      // Dev mode: skip Turnstile
      setTurnstileToken('dev-bypass');
      return;
    }
    if (win.turnstile) {
      const ts = win.turnstile as { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
      ts.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
      });
    }
  }, [step]);

  // Select a time slot
  const handleSlotClick = (time: string, available: boolean) => {
    if (!available) return;
    if (!selectedStart || (selectedStart && selectedEnd)) {
      // Start new selection
      setSelectedStart(time);
      setSelectedEnd(null);
    } else {
      // Set end time (must be after start)
      if (time <= selectedStart) {
        setSelectedStart(time);
        setSelectedEnd(null);
      } else {
        // End time is 30 min after the clicked slot
        const [h, m] = time.split(':').map(Number);
        const endMinutes = h! * 60 + m! + 30;
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
        // Check all slots between start and end are available
        const slots = availability?.slots ?? [];
        const startIdx = slots.findIndex(s => s.time === selectedStart);
        const endIdx = slots.findIndex(s => s.time === time);
        const allAvailable = slots.slice(startIdx, endIdx + 1).every(s => s.available);
        if (allAvailable) {
          setSelectedEnd(endTime);
        }
      }
    }
  };

  const isInSelection = (time: string): boolean => {
    if (!selectedStart) return false;
    if (!selectedEnd) return time === selectedStart;
    return time >= selectedStart && time < selectedEnd;
  };

  const durationHours = (): number => {
    if (!selectedStart || !selectedEnd) return 0;
    const [sh, sm] = selectedStart.split(':').map(Number);
    const [eh, em] = selectedEnd.split(':').map(Number);
    return ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
  };

  const estimatedCost = (): { total: number; dayHours: number; eveningHours: number; dayRate: number; eveningRate: number } => {
    if (!selectedRoom || !selectedStart || !selectedEnd) return { total: 0, dayHours: 0, eveningHours: 0, dayRate: 0, eveningRate: 0 };

    const [sh, sm] = selectedStart.split(':').map(Number);
    const [eh, em] = selectedEnd.split(':').map(Number);
    const startMin = sh! * 60 + sm!;
    const endMin = eh! * 60 + em!;
    const eveningMin = selectedRoom.evening_start_hour * 60;
    const dayRate = selectedRoom.hourly_rate;
    const eveningRate = selectedRoom.evening_hourly_rate ?? dayRate;

    if (!selectedRoom.evening_hourly_rate || endMin <= eveningMin) {
      // Entirely day rate
      const hours = (endMin - startMin) / 60;
      return { total: hours * dayRate, dayHours: hours, eveningHours: 0, dayRate, eveningRate };
    }
    if (startMin >= eveningMin) {
      // Entirely evening rate
      const hours = (endMin - startMin) / 60;
      return { total: hours * eveningRate, dayHours: 0, eveningHours: hours, dayRate, eveningRate };
    }
    // Split across day and evening
    const dayHours = (eveningMin - startMin) / 60;
    const eveningHours = (endMin - eveningMin) / 60;
    return { total: dayHours * dayRate + eveningHours * eveningRate, dayHours, eveningHours, dayRate, eveningRate };
  };

  const submitBooking = async () => {
    if (!selectedRoom || !selectedStart || !selectedEnd) return;
    if (!form.guest_name.trim() || !form.guest_email.trim()) {
      setError('Please fill in your name and email');
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the verification');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/bookings/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: form.guest_name.trim(),
          guest_email: form.guest_email.trim(),
          guest_phone: form.guest_phone.trim() || undefined,
          booking_date: selectedDate,
          start_time: selectedStart,
          end_time: selectedEnd,
          guest_count: form.guest_count,
          notes: form.notes.trim() || undefined,
          room_id: selectedRoom.id,
          turnstile_token: turnstileToken,
        }),
      });
      const data = await res.json() as { success: boolean; data?: { id: string }; error?: { message: string } };
      if (data.success) {
        setBookingId(data.data?.id ?? '');
        setSuccess(true);
        setStep(4);
      } else {
        setError(data.error?.message ?? 'Booking failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  };

  const resetBooking = () => {
    setStep(1);
    setSelectedRoom(null);
    setSelectedStart(null);
    setSelectedEnd(null);
    setSuccess(false);
    setBookingId('');
    setError('');
    setForm({ guest_name: '', guest_email: '', guest_phone: '', guest_count: 1, notes: '' });
    setTurnstileToken('');
  };

  // --- RENDER ---

  if (loadingRooms) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header (hidden in embed mode) */}
      {!isEmbed && (
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Book a Studio</h1>
              <p className="text-xs text-gray-500">Select a space, choose your time, and book instantly</p>
            </div>
          </div>
        </header>
      )}

      {/* Progress bar */}
      {!success && (
        <div className="border-b border-gray-100 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-medium">
              {[
                { n: 1, label: 'Select Room' },
                { n: 2, label: 'Date & Time' },
                { n: 3, label: 'Your Details' },
              ].map(({ n, label }, i) => (
                <div key={n} className="flex items-center gap-2">
                  {i > 0 && <div className={`h-px w-6 sm:w-10 ${step >= n ? 'bg-blue-500' : 'bg-gray-200'}`} />}
                  <div className="flex items-center gap-1.5">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      step > n ? 'bg-blue-600 text-white' : step === n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {step > n ? (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      ) : n}
                    </span>
                    <span className={`hidden sm:inline ${step >= n ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">

        {/* STEP 1: Room Selection */}
        {step === 1 && (
          <div>
            <h2 className="mb-1 text-xl font-bold text-gray-900">Choose a Space</h2>
            <p className="mb-6 text-sm text-gray-500">Select the room that best fits your needs</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rooms.map(room => (
                <button
                  key={room.id}
                  className="group overflow-hidden rounded-xl border-2 border-gray-200 bg-white text-left transition-all hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10"
                  onClick={() => { setSelectedRoom(room); setStep(2); }}
                >
                  {/* Room image */}
                  {room.image_url ? (
                    <div className="relative h-40 w-full overflow-hidden bg-gray-100">
                      <img src={room.image_url} alt={room.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      <div className="absolute bottom-3 right-3">
                        <svg className="h-5 w-5 text-white/80 transition-colors group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center" style={{ backgroundColor: room.color_hex + '15' }}>
                      <svg className="h-10 w-10" style={{ color: room.color_hex + '60' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                      </svg>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: room.color_hex }} />
                        <h3 className="text-base font-bold text-gray-900">{room.name}</h3>
                      </div>
                      {!room.image_url && (
                        <svg className="h-5 w-5 text-gray-300 transition-colors group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      )}
                    </div>
                    {room.description && <p className="mb-3 text-sm text-gray-500 line-clamp-2">{room.description}</p>}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-gray-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                        Up to {room.capacity}
                      </span>
                      <div className="text-right">
                        <span className="font-bold text-gray-900">{'\u00A3'}{room.hourly_rate}/hr</span>
                        {room.evening_hourly_rate != null && (
                          <span className="ml-1 text-xs text-gray-400">/ {'\u00A3'}{room.evening_hourly_rate} eve</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {rooms.length === 0 && (
              <div className="flex flex-col items-center py-16 text-gray-400">
                <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                <p>No rooms are currently available for booking.</p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Date & Time Selection */}
        {step === 2 && selectedRoom && (
          <div>
            <button className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setStep(1)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              Change room
            </button>

            <div className="mb-4 flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
              {selectedRoom.image_url ? (
                <img src={selectedRoom.image_url} alt={selectedRoom.name} className="h-10 w-14 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-lg" style={{ backgroundColor: selectedRoom.color_hex + '20', border: `2px solid ${selectedRoom.color_hex}` }} />
              )}
              <div>
                <p className="text-sm font-bold text-gray-900">{selectedRoom.name}</p>
                <p className="text-xs text-gray-500">
                  {'\u00A3'}{selectedRoom.hourly_rate}/hr
                  {selectedRoom.evening_hourly_rate != null && (
                    <span> &middot; {'\u00A3'}{selectedRoom.evening_hourly_rate}/hr from {String(selectedRoom.evening_start_hour).padStart(2, '0')}:00</span>
                  )}
                  {' '}&middot; Up to {selectedRoom.capacity} guests
                </p>
              </div>
            </div>

            {/* Date picker - horizontal scroll */}
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Select a Date</h3>
            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
              {availableDays.map(day => {
                const { day: d, weekday, month } = formatDayLabel(day);
                const isSelected = day === selectedDate;
                return (
                  <button
                    key={day}
                    className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                        : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-blue-300'
                    }`}
                    onClick={() => { setSelectedDate(day); setSelectedStart(null); setSelectedEnd(null); }}
                  >
                    <span className={`text-[10px] uppercase ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{weekday}</span>
                    <span className="text-lg font-bold">{d}</span>
                    <span className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{month}</span>
                  </button>
                );
              })}
            </div>

            {/* Time slots grid */}
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Select Time Slot</h3>
            <p className="mb-3 text-xs text-gray-400">Tap a start time, then tap an end time to select your slot</p>

            {loadingSlots ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                  {(availability?.slots ?? []).map((slot) => {
                    const inSelection = isInSelection(slot.time);
                    const isStart = slot.time === selectedStart;
                    const eveningHour = selectedRoom.evening_start_hour;
                    const slotHour = parseInt(slot.time.split(':')[0]!, 10);
                    const isEvening = selectedRoom.evening_hourly_rate != null && slotHour >= eveningHour;
                    return (
                      <button
                        key={slot.time}
                        disabled={!slot.available}
                        className={`rounded-lg px-1 py-2.5 text-center text-xs font-semibold transition-all ${
                          !slot.available
                            ? 'cursor-not-allowed bg-gray-100 text-gray-300 line-through'
                            : inSelection
                              ? isStart
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                : 'bg-blue-100 text-blue-700'
                              : isEvening
                                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 hover:ring-indigo-300'
                                : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-blue-50 hover:ring-blue-300'
                        }`}
                        onClick={() => handleSlotClick(slot.time, slot.available)}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>

                {/* Selection summary */}
                {selectedStart && (() => {
                  const cost = estimatedCost();
                  return (
                    <div className="mt-4 rounded-xl bg-blue-50 p-4">
                      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="text-gray-600">{formatDate(selectedDate)}: </span>
                          <span className="font-bold text-gray-900">
                            {selectedStart}{selectedEnd ? ` - ${selectedEnd}` : ' (select end time)'}
                          </span>
                          {selectedEnd && (
                            <span className="ml-2 text-gray-500">({durationHours()}h)</span>
                          )}
                        </div>
                        {selectedEnd && (
                          <span className="text-lg font-bold text-gray-900">{'\u00A3'}{cost.total.toFixed(0)}</span>
                        )}
                      </div>
                      {selectedEnd && cost.dayHours > 0 && cost.eveningHours > 0 && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>{cost.dayHours}h daytime @ {'\u00A3'}{cost.dayRate}/hr</span>
                          <span>{cost.eveningHours}h evening @ {'\u00A3'}{cost.eveningRate}/hr</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-white ring-1 ring-gray-200" /> Day rate</span>
                  {selectedRoom.evening_hourly_rate != null && (
                    <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-indigo-50 ring-1 ring-indigo-200" /> Evening rate</span>
                  )}
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-blue-600" /> Selected</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-gray-100" /> Booked</span>
                </div>

                {/* Continue button */}
                <button
                  className="mt-6 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-40 disabled:shadow-none"
                  disabled={!selectedStart || !selectedEnd}
                  onClick={() => setStep(3)}
                >
                  Continue to Details
                </button>
              </>
            )}
          </div>
        )}

        {/* STEP 3: Guest Details */}
        {step === 3 && selectedRoom && selectedStart && selectedEnd && (
          <div>
            <button className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" onClick={() => setStep(2)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              Change time
            </button>

            {/* Booking summary card */}
            <div className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded" style={{ backgroundColor: selectedRoom.color_hex }} />
                    <p className="text-sm font-bold text-gray-900">{selectedRoom.name}</p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {formatDate(selectedDate)} &middot; {selectedStart} - {selectedEnd} &middot; {durationHours()}h
                  </p>
                </div>
                <p className="text-lg font-bold text-gray-900">{'\u00A3'}{estimatedCost().total.toFixed(0)}</p>
              </div>
            </div>

            <h2 className="mb-1 text-xl font-bold text-gray-900">Your Details</h2>
            <p className="mb-6 text-sm text-gray-500">Tell us a bit about you and your event</p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                  <input
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="John Smith"
                    value={form.guest_name}
                    onChange={(e) => setForm(f => ({ ...f, guest_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
                  <input
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    type="email"
                    placeholder="john@example.com"
                    value={form.guest_email}
                    onChange={(e) => setForm(f => ({ ...f, guest_email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    type="tel"
                    placeholder="+44 7700 900000"
                    value={form.guest_phone}
                    onChange={(e) => setForm(f => ({ ...f, guest_phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Number of Guests</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    type="number"
                    min={1}
                    max={selectedRoom.capacity}
                    value={form.guest_count}
                    onChange={(e) => setForm(f => ({ ...f, guest_count: Math.max(1, Number(e.target.value)) }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Special Requests or Notes</label>
                <textarea
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  rows={3}
                  placeholder="Any special requirements, equipment needed, event details..."
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* Turnstile */}
              <div ref={turnstileRef} className="flex justify-center" />

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-700">{error}</p>
                </div>
              )}

              <button
                className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-40 disabled:shadow-none"
                onClick={submitBooking}
                disabled={submitting || !form.guest_name.trim() || !form.guest_email.trim()}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Submitting...
                  </span>
                ) : (
                  `Request Booking - \u00A3${estimatedCost().total.toFixed(0)}`
                )}
              </button>

              <p className="text-center text-[11px] text-gray-400">
                Bookings are subject to confirmation. You will receive an email once approved.
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: Confirmation */}
        {step === 4 && success && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Booking Request Submitted!</h2>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Thank you for your booking request. Our team will review it and send you a confirmation email shortly.
            </p>

            {selectedRoom && selectedStart && selectedEnd && (
              <div className="mt-6 w-full max-w-sm rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Room</span>
                    <span className="font-medium text-gray-900">{selectedRoom.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium text-gray-900">{formatDate(selectedDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Time</span>
                    <span className="font-medium text-gray-900">{selectedStart} - {selectedEnd}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Duration</span>
                    <span className="font-medium text-gray-900">{durationHours()} hour{durationHours() !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-500">Estimated Cost</span>
                    <span className="text-lg font-bold text-gray-900">{'\u00A3'}{estimatedCost().total.toFixed(0)}</span>
                  </div>
                </div>
                {bookingId && (
                  <p className="mt-3 text-xs text-gray-400">Ref: {bookingId.slice(0, 8).toUpperCase()}</p>
                )}
              </div>
            )}

            <button
              className="mt-8 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700"
              onClick={resetBooking}
            >
              Make Another Booking
            </button>
          </div>
        )}
      </div>

      {/* Footer (hidden in embed mode) */}
      {!isEmbed && (
        <footer className="border-t border-gray-100 py-4 text-center text-[11px] text-gray-400">
          Powered by StudioFlow360
        </footer>
      )}
    </div>
  );
}
