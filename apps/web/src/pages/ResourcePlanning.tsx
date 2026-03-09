import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast.tsx';

const API = '/api/resource-planning';

interface RoomUtil {
  id: string; name: string; color_hex: string; hourly_rate: number; capacity: number;
  booking_count: number; booked_hours: number; revenue: number;
  available_hours: number; utilization_pct: number;
}

interface CapacityTarget {
  id: string; room_id: string; room_name: string; target_type: string;
  target_value: number; effective_from: string; effective_to: string | null;
}

interface DayDensity {
  booking_date: string; count: number; rooms_used: number;
}

interface StaffAvail {
  id: string; display_name: string; scheduled_shifts: number; time_off_days: number;
}

interface ForecastDay {
  date: string; day_of_week: number; expected_bookings: number; expected_revenue: number;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtCurrency(v: number | null): string {
  return '$' + (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ResourcePlanningPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'forecast'>('overview');
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomUtil[]>([]);
  const [targets, setTargets] = useState<CapacityTarget[]>([]);
  const [density, setDensity] = useState<DayDensity[]>([]);
  const [staffAvail, setStaffAvail] = useState<StaffAvail[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      const json = await res.json() as { success: boolean; data: Record<string, unknown> };
      if (json.success) {
        setRooms(json.data.rooms as RoomUtil[]);
        setTargets(json.data.capacity_targets as CapacityTarget[]);
        setDensity(json.data.upcoming_density as DayDensity[]);
        setStaffAvail(json.data.staff_availability as StaffAvail[]);
        setMeta(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchForecast = useCallback(async () => {
    const res = await fetch(`${API}/forecast?weeks=4`);
    const json = await res.json() as { success: boolean; data: { forecast: ForecastDay[] } };
    if (json.success) setForecast(json.data.forecast);
  }, []);

  useEffect(() => { fetchDashboard(); fetchForecast(); }, [fetchDashboard, fetchForecast]);

  const deleteTarget = async (id: string) => {
    await fetch(`${API}/targets/${id}`, { method: 'DELETE' });
    toast('Target removed', 'success');
    fetchDashboard();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  const totalBooked = rooms.reduce((s, r) => s + (r.booked_hours || 0), 0);
  const totalAvail = rooms.reduce((s, r) => s + r.available_hours, 0);
  const overallUtil = totalAvail > 0 ? Math.round((totalBooked / totalAvail) * 100) : 0;
  const totalRevenue = rooms.reduce((s, r) => s + (r.revenue || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resource Planning</h1>
        <p className="text-sm text-gray-500">
          {(meta.date_range as Record<string, string>)?.from} to {(meta.date_range as Record<string, string>)?.to} ({meta.total_days as number} days, {meta.operating_hours_per_day as number}h/day)
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Overall Utilization" value={`${overallUtil}%`} sub={`${totalBooked.toFixed(0)}h / ${totalAvail}h`} color={overallUtil >= 60 ? 'text-green-600' : overallUtil >= 30 ? 'text-yellow-600' : 'text-red-600'} />
        <SummaryCard label="Total Revenue" value={fmtCurrency(totalRevenue)} sub={`${rooms.reduce((s, r) => s + (r.booking_count || 0), 0)} bookings`} />
        <SummaryCard label="Active Rooms" value={String(rooms.length)} sub="configured" />
        <SummaryCard label="Available Staff" value={String(staffAvail.length)} sub={`${staffAvail.filter(s => s.time_off_days === 0).length} fully available`} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button onClick={() => setTab('overview')} className={`pb-3 text-sm font-medium transition-colors ${tab === 'overview' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
          Overview
        </button>
        <button onClick={() => setTab('forecast')} className={`pb-3 text-sm font-medium transition-colors ${tab === 'forecast' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
          Demand Forecast
        </button>
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Room utilization */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Room Utilization</h3>
            <div className="space-y-4">
              {rooms.map(r => (
                <div key={r.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color_hex || '#6B7280' }} />
                      <span className="text-sm font-medium text-gray-800">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{r.booking_count} bookings</span>
                      <span>{r.booked_hours || 0}h / {r.available_hours}h</span>
                      <span className="font-medium">{fmtCurrency(r.revenue)}</span>
                      <span className={`rounded-full px-2 py-0.5 font-bold ${r.utilization_pct >= 75 ? 'bg-green-100 text-green-700' : r.utilization_pct >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {r.utilization_pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, r.utilization_pct)}%`, backgroundColor: r.color_hex || '#3B82F6' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Density */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Upcoming 7-Day Booking Density</h3>
            {density.length === 0 ? (
              <p className="text-sm text-gray-500">No bookings in the upcoming period</p>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {density.map(d => {
                  const dt = new Date(d.booking_date + 'T00:00:00');
                  return (
                    <div key={d.booking_date} className="rounded-lg bg-gray-50 p-3 text-center">
                      <p className="text-xs text-gray-500">{DOW[dt.getDay()]}</p>
                      <p className="text-xs text-gray-400">{d.booking_date.slice(5)}</p>
                      <p className="mt-1 text-lg font-bold text-gray-900">{d.count}</p>
                      <p className="text-[10px] text-gray-500">{d.rooms_used} room{d.rooms_used !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Staff Availability */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Staff Availability</h3>
            <div className="overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">Staff</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">Scheduled Shifts</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">Time Off</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staffAvail.map(s => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{s.display_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.scheduled_shifts}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.time_off_days} day{s.time_off_days !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.time_off_days > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                          {s.time_off_days > 0 ? 'Partial' : 'Available'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Capacity Targets */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Capacity Targets</h3>
            {targets.length === 0 ? (
              <p className="text-sm text-gray-500">No capacity targets configured</p>
            ) : (
              <div className="space-y-2">
                {targets.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{t.room_name}</span>
                      <span className="mx-2 text-gray-400">-</span>
                      <span className="text-sm text-gray-600">{t.target_type.replace(/_/g, ' ')}: {t.target_value}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">from {t.effective_from}{t.effective_to ? ` to ${t.effective_to}` : ''}</span>
                      <button onClick={() => deleteTarget(t.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'forecast' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">4-Week Demand Forecast</h3>
            <p className="mb-4 text-xs text-gray-500">Based on 12-week historical weekly averages</p>
            {forecast.length === 0 ? (
              <p className="text-sm text-gray-500">Not enough historical data for forecasting</p>
            ) : (
              <>
                {/* Weekly summary */}
                {[0, 1, 2, 3].map(week => {
                  const weekDays = forecast.slice(week * 7, (week + 1) * 7);
                  const totalBookings = weekDays.reduce((s, d) => s + d.expected_bookings, 0);
                  const totalRevenue = weekDays.reduce((s, d) => s + d.expected_revenue, 0);
                  return (
                    <div key={week} className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-700">Week {week + 1}: {weekDays[0]?.date} - {weekDays[weekDays.length - 1]?.date}</p>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>{totalBookings.toFixed(1)} expected bookings</span>
                          <span>{fmtCurrency(totalRevenue)} expected revenue</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {weekDays.map(d => {
                          const intensity = Math.min(1, d.expected_bookings / 5);
                          return (
                            <div key={d.date} className="rounded-lg border border-gray-100 p-2 text-center" style={{ backgroundColor: `rgba(59, 130, 246, ${intensity * 0.2})` }}>
                              <p className="text-[10px] text-gray-500">{DOW[d.day_of_week]}</p>
                              <p className="text-[10px] text-gray-400">{d.date.slice(5)}</p>
                              <p className="mt-0.5 text-sm font-bold text-gray-800">{d.expected_bookings}</p>
                              <p className="text-[10px] text-gray-500">{fmtCurrency(d.expected_revenue)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
