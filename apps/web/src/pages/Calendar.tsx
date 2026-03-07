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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Room Calendar</h1>
        <div className="flex items-center gap-3">
          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => navigate(-7)}>
            &larr; Prev Week
          </button>
          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => setCurrentDate(new Date())}>
            Today
          </button>
          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => navigate(7)}>
            Next Week &rarr;
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-96 animate-pulse rounded-lg bg-gray-200" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="w-32 px-4 py-3 text-left text-sm font-medium text-gray-500">Room</th>
                {weekDates.map((date, i) => (
                  <th key={date} className="px-2 py-3 text-center text-sm font-medium text-gray-500">
                    <div>{dayLabels[i]}</div>
                    <div className="text-xs">{date.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendarData?.rooms.map(({ room, bookings }) => (
                <tr key={room.id} className="border-b border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: room.color_hex }} />
                      <span className="text-sm font-medium">{room.name}</span>
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const dayBookings = bookings.filter((b) => b.booking_date === date);
                    return (
                      <td key={date} className="px-1 py-2 align-top">
                        {dayBookings.map((b) => (
                          <Link
                            key={b.id}
                            to={`/bookings/${b.id}`}
                            className={`mb-1 block rounded px-2 py-1 text-xs ${
                              ['CONFIRMED', 'PLATFORM_ACTIONED'].includes(b.status)
                                ? 'text-white'
                                : 'border border-dashed text-gray-700'
                            }`}
                            style={
                              ['CONFIRMED', 'PLATFORM_ACTIONED'].includes(b.status)
                                ? { backgroundColor: room.color_hex }
                                : { borderColor: room.color_hex }
                            }
                          >
                            <div className="font-medium">{b.start_time}–{b.end_time}</div>
                            <div className="truncate">{b.guest_name}</div>
                          </Link>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Unassigned bookings */}
          {calendarData?.unassigned && calendarData.unassigned.length > 0 && (
            <div className="border-t border-gray-200 p-4">
              <h3 className="mb-2 text-sm font-medium text-gray-500">Unassigned Bookings</h3>
              <div className="flex flex-wrap gap-2">
                {calendarData.unassigned.map((b) => (
                  <Link
                    key={b.id}
                    to={`/bookings/${b.id}`}
                    className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs hover:bg-gray-100"
                  >
                    <span className="font-medium">{b.guest_name}</span>
                    <span className="ml-2 text-gray-500">{b.booking_date} {b.start_time}</span>
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
