import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import type { BookingStatus } from '@studioflow360/shared';

interface CalendarBooking {
  id: string;
  guest_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  platform: string;
  room_id: string | null;
  room_name: string | null;
  room_color: string | null;
}

interface CalendarRoom {
  room: { id: string; name: string; color_hex: string };
  bookings: CalendarBooking[];
}

interface CalendarData {
  rooms: CalendarRoom[];
  unassigned: CalendarBooking[];
}

function getWeekDates(baseDate: Date): string[] {
  const start = new Date(baseDate);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0]!;
  });
}

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  const weekDates = getWeekDates(currentDate);
  const startDate = weekDates[0]!;
  const endDate = weekDates[6]!;

  useEffect(() => {
    setLoading(true);
    api
      .get<CalendarData>(`/calendar?start_date=${startDate}&end_date=${endDate}`)
      .then((res) => {
        if (res.success && res.data) setCalendarData(res.data);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const navigate = (days: number) => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + days);
      return n;
    });
  };

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex items-end justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Calendar</h1>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-ghost py-1.5" onClick={() => navigate(-7)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Prev
          </button>
          <button className="btn btn-ghost py-1.5" onClick={() => setCurrentDate(new Date())}>Today</button>
          <button className="btn btn-ghost py-1.5" onClick={() => navigate(7)}>
            Next
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-96" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="w-36 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Room</th>
                {weekDates.map((date, i) => {
                  const isToday = date === today;
                  return (
                    <th key={date} className={`px-2 py-3 text-center ${isToday ? 'bg-blue-50/50' : ''}`}>
                      <div className={`text-[11px] font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{dayLabels[i]}</div>
                      <div className={`mt-0.5 text-xs ${isToday ? 'font-bold text-blue-600' : 'text-gray-500'}`}>{date.slice(5)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {calendarData?.rooms.map(({ room, bookings }) => (
                <tr key={room.id} className="border-b border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-3 w-3 rounded" style={{ backgroundColor: room.color_hex }} />
                      <span className="text-xs font-semibold text-gray-700">{room.name}</span>
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const dayBookings = bookings.filter((b) => b.booking_date === date);
                    const isToday = date === today;
                    return (
                      <td key={date} className={`px-1 py-1.5 align-top ${isToday ? 'bg-blue-50/30' : ''}`}>
                        {dayBookings.map((b) => {
                          const confirmed = ['CONFIRMED', 'PLATFORM_ACTIONED'].includes(b.status);
                          return (
                            <Link
                              key={b.id}
                              to={`/bookings/${b.id}`}
                              className={`mb-1 block rounded-md px-2 py-1.5 text-[11px] transition-all hover:opacity-80 ${
                                confirmed ? 'text-white shadow-sm' : 'border border-dashed'
                              }`}
                              style={confirmed
                                ? { backgroundColor: room.color_hex }
                                : { borderColor: room.color_hex, color: room.color_hex }
                              }
                            >
                              <div className="font-bold">{b.start_time}\u2013{b.end_time}</div>
                              <div className="truncate">{b.guest_name}</div>
                            </Link>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {calendarData?.unassigned && calendarData.unassigned.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-50/50 p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Unassigned Bookings</h3>
              <div className="flex flex-wrap gap-2">
                {calendarData.unassigned.map((b) => (
                  <Link
                    key={b.id}
                    to={`/bookings/${b.id}`}
                    className="card-interactive inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-gray-900">{b.guest_name}</span>
                    <span className="text-gray-400">{b.booking_date} {b.start_time}</span>
                    <StatusBadge status={b.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
