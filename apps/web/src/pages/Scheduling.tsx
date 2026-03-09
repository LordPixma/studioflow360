import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';

interface StaffMember {
  id: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
}

interface Room {
  id: string;
  name: string;
  color_hex: string;
}

interface Shift {
  id: string;
  staff_id: string;
  room_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  notes: string | null;
  staff_name: string;
  room_name: string | null;
  room_color: string | null;
}

interface TimeOffRequest {
  id: string;
  staff_id: string;
  request_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  staff_name: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface ShiftSummary {
  shifts_by_date: Array<{ shift_date: string; count: number }>;
  staff_hours: Array<{ display_name: string; staff_id: string; shift_count: number; total_hours: number }>;
  active_time_off: number;
}

type Tab = 'shifts' | 'time-off';

const SHIFT_TYPE_STYLES: Record<string, string> = {
  regular: 'bg-blue-100 text-blue-700',
  overtime: 'bg-purple-100 text-purple-700',
  on_call: 'bg-amber-100 text-amber-700',
  cover: 'bg-gray-100 text-gray-700',
};

const TIME_OFF_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
};

const TIME_OFF_TYPE_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  sick: 'Sick Leave',
  personal: 'Personal',
  other: 'Other',
};

export function SchedulingPage() {
  const { staff: currentStaff } = useAuth();
  const canManage = currentStaff?.permissions?.includes('scheduling.manage');
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>('shifts');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOffRequest[]>([]);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    return d.toISOString().split('T')[0]!;
  });

  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0]!;
  })();

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0]!;
  });

  // Shift form
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    staff_id: '', room_id: '', shift_date: '', start_time: '09:00', end_time: '17:00', shift_type: 'regular', notes: '',
  });

  // Time-off form
  const [showTimeOffForm, setShowTimeOffForm] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    start_date: '', end_date: '', request_type: 'holiday', reason: '',
  });

  const fetchStaffAndRooms = useCallback(async () => {
    const [staffRes, roomsRes] = await Promise.all([
      api.get<StaffMember[]>('/staff/list'),
      api.get<Room[]>('/rooms'),
    ]);
    if (staffRes.success && staffRes.data) setStaffList(staffRes.data);
    if (roomsRes.success && roomsRes.data) setRooms(roomsRes.data);
  }, []);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ start_date: weekStart, end_date: weekEnd });
    const res = await api.get<Shift[]>(`/scheduling/shifts?${params}`);
    if (res.success && res.data) setShifts(res.data);
    setLoading(false);
  }, [weekStart, weekEnd]);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ start_date: weekStart, end_date: weekEnd });
    const res = await api.get<ShiftSummary>(`/scheduling/shifts/summary?${params}`);
    if (res.success && res.data) setSummary(res.data);
  }, [weekStart, weekEnd]);

  const fetchTimeOffs = useCallback(async () => {
    const res = await api.get<TimeOffRequest[]>('/scheduling/time-off');
    if (res.success && res.data) setTimeOffs(res.data);
  }, []);

  useEffect(() => { fetchStaffAndRooms(); }, [fetchStaffAndRooms]);
  useEffect(() => { fetchShifts(); fetchSummary(); }, [fetchShifts, fetchSummary]);
  useEffect(() => { if (tab === 'time-off') fetchTimeOffs(); }, [tab, fetchTimeOffs]);

  const navigateWeek = (dir: number) => {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().split('T')[0]!);
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ id: string }>('/scheduling/shifts', {
      staff_id: shiftForm.staff_id,
      room_id: shiftForm.room_id || undefined,
      shift_date: shiftForm.shift_date,
      start_time: shiftForm.start_time,
      end_time: shiftForm.end_time,
      shift_type: shiftForm.shift_type,
      notes: shiftForm.notes || undefined,
    });
    if (res.success) {
      toast('Shift created', 'success');
      setShowShiftForm(false);
      setShiftForm({ staff_id: '', room_id: '', shift_date: '', start_time: '09:00', end_time: '17:00', shift_type: 'regular', notes: '' });
      fetchShifts();
      fetchSummary();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const handleDeleteShift = async (id: string) => {
    const res = await api.delete<void>(`/scheduling/shifts/${id}`);
    if (res.success) {
      toast('Shift removed', 'success');
      fetchShifts();
      fetchSummary();
    }
  };

  const handleRequestTimeOff = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ id: string }>('/scheduling/time-off', {
      start_date: timeOffForm.start_date,
      end_date: timeOffForm.end_date,
      request_type: timeOffForm.request_type,
      reason: timeOffForm.reason || undefined,
    });
    if (res.success) {
      toast('Time-off request submitted', 'success');
      setShowTimeOffForm(false);
      setTimeOffForm({ start_date: '', end_date: '', request_type: 'holiday', reason: '' });
      fetchTimeOffs();
    } else {
      toast(res.error?.message ?? 'Failed', 'error');
    }
  };

  const handleReviewTimeOff = async (id: string, status: 'approved' | 'declined') => {
    const res = await api.patch<{ id: string }>(`/scheduling/time-off/${id}/review`, { status });
    if (res.success) {
      toast(`Request ${status}`, 'success');
      fetchTimeOffs();
    }
  };

  const handleDeleteTimeOff = async (id: string) => {
    const res = await api.delete<void>(`/scheduling/time-off/${id}`);
    if (res.success) {
      toast('Request cancelled', 'success');
      fetchTimeOffs();
    }
  };

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    return { day: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), date: d.getUTCDate(), full: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) };
  };

  const formatDate = (d: string) => {
    try { return new Date(d + (d.includes('T') ? '' : 'T00:00:00Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  const today = new Date().toISOString().split('T')[0]!;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Scheduling</h1>
          <p className="mt-1 text-sm text-gray-500">Manage shifts, room assignments, and time-off requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1" style={{ width: 'fit-content' }}>
        {[{ key: 'shifts' as Tab, label: 'Shifts' }, { key: 'time-off' as Tab, label: 'Time Off' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Shifts Tab */}
      {tab === 'shifts' && (
        <>
          {/* Summary */}
          {summary && (
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {summary.staff_hours.slice(0, 3).map(sh => (
                <div key={sh.staff_id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">{sh.display_name}</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{sh.total_hours?.toFixed(1) ?? 0}h</p>
                  <p className="text-xs text-gray-400">{sh.shift_count} shifts</p>
                </div>
              ))}
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">On Time Off</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{summary.active_time_off}</p>
                <p className="text-xs text-gray-400">this week</p>
              </div>
            </div>
          )}

          {/* Week Nav */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigateWeek(-1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">&larr;</button>
              <span className="text-sm font-medium text-gray-700">
                {formatDate(weekStart)} – {formatDate(weekEnd)}
              </span>
              <button onClick={() => navigateWeek(1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">&rarr;</button>
              <button onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
                setWeekStart(d.toISOString().split('T')[0]!);
              }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Today</button>
            </div>
            {canManage && (
              <button onClick={() => setShowShiftForm(!showShiftForm)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {showShiftForm ? 'Cancel' : 'Add Shift'}
              </button>
            )}
          </div>

          {/* Add Shift Form */}
          {showShiftForm && (
            <form onSubmit={handleCreateShift} className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Staff *</label>
                  <select required value={shiftForm.staff_id} onChange={e => setShiftForm(f => ({ ...f, staff_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                    <option value="">Select</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Room</label>
                  <select value={shiftForm.room_id} onChange={e => setShiftForm(f => ({ ...f, room_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                    <option value="">Any</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Date *</label>
                  <input type="date" required value={shiftForm.shift_date} onChange={e => setShiftForm(f => ({ ...f, shift_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Start</label>
                  <input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">End</label>
                  <input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
                  <select value={shiftForm.shift_type} onChange={e => setShiftForm(f => ({ ...f, shift_type: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                    <option value="regular">Regular</option>
                    <option value="overtime">Overtime</option>
                    <option value="on_call">On Call</option>
                    <option value="cover">Cover</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Add</button>
                </div>
              </div>
            </form>
          )}

          {/* Weekly Grid */}
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="grid grid-cols-7 divide-x divide-gray-100">
              {weekDays.map(day => {
                const { day: dayName, date, full } = formatDay(day);
                const dayShifts = shifts.filter(s => s.shift_date === day);
                const isToday = day === today;

                return (
                  <div key={day} className={`min-h-[200px] ${isToday ? 'bg-blue-50/30' : ''}`}>
                    <div className={`border-b border-gray-100 px-3 py-2 text-center ${isToday ? 'bg-blue-50' : 'bg-gray-50/50'}`}>
                      <p className="text-xs font-medium text-gray-500">{dayName}</p>
                      <p className={`text-lg font-bold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{date}</p>
                    </div>
                    <div className="space-y-1.5 p-2">
                      {loading && <p className="text-center text-xs text-gray-300">...</p>}
                      {dayShifts.map(shift => (
                        <div key={shift.id} className="group relative rounded-lg border border-gray-100 bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
                          style={shift.room_color ? { borderLeftColor: shift.room_color, borderLeftWidth: 3 } : {}}>
                          <p className="text-xs font-medium text-gray-900">{shift.staff_name}</p>
                          <p className="text-xs text-gray-500">{shift.start_time}–{shift.end_time}</p>
                          {shift.room_name && <p className="text-xs text-gray-400">{shift.room_name}</p>}
                          <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SHIFT_TYPE_STYLES[shift.shift_type] ?? 'bg-gray-100 text-gray-600'}`}>
                            {shift.shift_type}
                          </span>
                          {canManage && (
                            <button onClick={() => handleDeleteShift(shift.id)}
                              className="absolute right-1 top-1 hidden rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600 group-hover:block">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {!loading && dayShifts.length === 0 && (
                        <p className="py-4 text-center text-xs text-gray-300">No shifts</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Time Off Tab */}
      {tab === 'time-off' && (
        <>
          <div className="mb-4 flex justify-end">
            <button onClick={() => setShowTimeOffForm(!showTimeOffForm)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              {showTimeOffForm ? 'Cancel' : 'Request Time Off'}
            </button>
          </div>

          {showTimeOffForm && (
            <form onSubmit={handleRequestTimeOff} className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
                  <select value={timeOffForm.request_type} onChange={e => setTimeOffForm(f => ({ ...f, request_type: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                    <option value="holiday">Holiday</option>
                    <option value="sick">Sick Leave</option>
                    <option value="personal">Personal</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Start Date *</label>
                  <input type="date" required value={timeOffForm.start_date} onChange={e => setTimeOffForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">End Date *</label>
                  <input type="date" required value={timeOffForm.end_date} onChange={e => setTimeOffForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Reason</label>
                  <input type="text" value={timeOffForm.reason} onChange={e => setTimeOffForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Submit</button>
                </div>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Staff</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {timeOffs.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No time-off requests</td></tr>
                ) : timeOffs.map(req => (
                  <tr key={req.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{req.staff_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{TIME_OFF_TYPE_LABELS[req.request_type] ?? req.request_type}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(req.start_date)} – {formatDate(req.end_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{req.reason ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TIME_OFF_STYLES[req.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {req.status}
                      </span>
                      {req.reviewer_name && <p className="mt-0.5 text-xs text-gray-400">by {req.reviewer_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {req.status === 'pending' && canManage && (
                          <>
                            <button onClick={() => handleReviewTimeOff(req.id, 'approved')}
                              className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100">Approve</button>
                            <button onClick={() => handleReviewTimeOff(req.id, 'declined')}
                              className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100">Decline</button>
                          </>
                        )}
                        {req.status === 'pending' && req.staff_id === currentStaff?.id && (
                          <button onClick={() => handleDeleteTimeOff(req.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700">Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
