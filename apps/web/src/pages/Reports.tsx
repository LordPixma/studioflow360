import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast.tsx';

const API = '/api/reports';

type ReportTab = 'revenue' | 'occupancy' | 'bookings' | 'staff-utilization' | 'financial-summary' | 'guest-activity';

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'staff-utilization', label: 'Staff' },
  { key: 'financial-summary', label: 'Financial' },
  { key: 'guest-activity', label: 'Guests' },
];

function defaultFrom() {
  return new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
}
function defaultTo() {
  return new Date().toISOString().split('T')[0];
}

function fmtCurrency(v: number | null | undefined): string {
  return '$' + (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ReportsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<ReportTab>('revenue');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedReports, setSavedReports] = useState<Array<Record<string, unknown>>>([]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/${tab}?date_from=${dateFrom}&date_to=${dateTo}`);
      const json = await res.json() as { success: boolean; data: Record<string, unknown> };
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [tab, dateFrom, dateTo]);

  const fetchSaved = useCallback(async () => {
    const res = await fetch(`${API}/saved`);
    const json = await res.json() as { success: boolean; data: Array<Record<string, unknown>> };
    if (json.success) setSavedReports(json.data);
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const downloadCSV = async () => {
    const res = await fetch(`${API}/${tab}?date_from=${dateFrom}&date_to=${dateTo}&format=csv`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV downloaded', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Analyze studio performance and export data</p>
        </div>
        <button onClick={downloadCSV} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Export CSV
        </button>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-gray-700">From</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
        <label className="text-sm font-medium text-gray-700">To</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
        <div className="ml-auto flex gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => { setDateFrom(new Date(Date.now() - d * 86400000).toISOString().split('T')[0]); setDateTo(defaultTo()); }}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">{d}d</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
      ) : data ? (
        <div className="space-y-6">
          {tab === 'revenue' && <RevenueReport data={data} />}
          {tab === 'occupancy' && <OccupancyReport data={data} />}
          {tab === 'bookings' && <BookingsReport data={data} />}
          {tab === 'staff-utilization' && <StaffReport data={data} />}
          {tab === 'financial-summary' && <FinancialReport data={data} />}
          {tab === 'guest-activity' && <GuestReport data={data} />}
        </div>
      ) : null}

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Saved Reports</h3>
          <div className="space-y-2">
            {savedReports.map(r => (
              <div key={r.id as string} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{r.name as string}</p>
                  <p className="text-xs text-gray-500">{r.report_type as string} {r.schedule ? `- ${r.schedule}` : ''}</p>
                </div>
                {!!r.is_pinned && <span className="text-xs text-yellow-600">Pinned</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Sub-report components ============ */

function RevenueReport({ data }: { data: Record<string, unknown> }) {
  const totals = data.totals as Record<string, unknown> | null;
  const periods = (data.periods as Array<Record<string, unknown>>) || [];

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={fmtCurrency(totals?.total_revenue as number)} />
        <StatCard label="Bookings" value={String(totals?.total_bookings ?? 0)} />
        <StatCard label="Avg Booking Value" value={fmtCurrency(totals?.avg_booking_value as number)} />
        <StatCard label="Unique Guests" value={String(totals?.unique_guests ?? 0)} />
      </div>
      <DataTable rows={periods} columns={[
        { key: 'period', label: 'Period' },
        { key: 'booking_count', label: 'Bookings' },
        { key: 'total_revenue', label: 'Revenue', fmt: v => fmtCurrency(v as number) },
        { key: 'avg_revenue', label: 'Avg Revenue', fmt: v => fmtCurrency(v as number) },
        { key: 'unique_guests', label: 'Guests' },
      ]} />
    </>
  );
}

function OccupancyReport({ data }: { data: Record<string, unknown> }) {
  const rooms = (data.rooms as Array<Record<string, unknown>>) || [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        {rooms.map(r => (
          <div key={r.room_id as string} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">{r.room_name as string}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${(r.utilization_pct as number) >= 75 ? 'bg-green-100 text-green-700' : (r.utilization_pct as number) >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                {r.utilization_pct as number}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, r.utilization_pct as number)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>{r.total_hours as number}h booked / {r.available_hours as number}h available</span>
              <span>{fmtCurrency(r.total_revenue as number)} revenue</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function BookingsReport({ data }: { data: Record<string, unknown> }) {
  const byStatus = (data.by_status as Array<Record<string, unknown>>) || [];
  const byPlatform = (data.by_platform as Array<Record<string, unknown>>) || [];
  const byRoom = (data.by_room as Array<Record<string, unknown>>) || [];
  const metrics = data.approval_metrics as Record<string, unknown> | null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Bookings" value={String(metrics?.total ?? 0)} />
        <StatCard label="Approved" value={String(metrics?.approved ?? 0)} color="text-green-600" />
        <StatCard label="Rejected" value={String(metrics?.rejected ?? 0)} color="text-red-600" />
        <StatCard label="Avg Approval Time" value={`${metrics?.avg_hours_to_approve ?? '-'}h`} />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">By Status</h4>
          {byStatus.map(s => (
            <div key={s.status as string} className="flex justify-between py-1.5 text-sm">
              <span className="text-gray-700">{s.status as string}</span>
              <span className="font-medium">{s.count as number}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">By Platform</h4>
          {byPlatform.map(p => (
            <div key={p.platform as string} className="flex justify-between py-1.5 text-sm">
              <span className="text-gray-700 capitalize">{p.platform as string}</span>
              <span className="font-medium">{p.count as number}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">By Room</h4>
          {byRoom.map(r => (
            <div key={r.room_name as string} className="flex justify-between py-1.5 text-sm">
              <span className="text-gray-700">{r.room_name as string}</span>
              <span className="font-medium">{r.count as number}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StaffReport({ data }: { data: Record<string, unknown> }) {
  const staff = (data.staff as Array<Record<string, unknown>>) || [];

  return (
    <DataTable rows={staff} columns={[
      { key: 'display_name', label: 'Staff' },
      { key: 'role', label: 'Role' },
      { key: 'bookings_handled', label: 'Bookings' },
      { key: 'tasks_assigned', label: 'Tasks Assigned' },
      { key: 'tasks_completed', label: 'Tasks Done' },
      { key: 'shift_hours', label: 'Shift Hours', fmt: v => `${v ?? 0}h` },
    ]} />
  );
}

function FinancialReport({ data }: { data: Record<string, unknown> }) {
  const revenue = data.revenue as Record<string, unknown> | null;
  const invoices = data.invoices as Record<string, unknown> | null;
  const expenses = data.expenses as Record<string, unknown> | null;
  const byCategory = (expenses?.by_category as Array<Record<string, unknown>>) || [];

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Booking Revenue" value={fmtCurrency(revenue?.booking_revenue as number)} color="text-green-600" />
        <StatCard label="Total Expenses" value={fmtCurrency(expenses?.total as number)} color="text-red-600" />
        <StatCard label="Net Income" value={fmtCurrency(data.net_income as number)} color={(data.net_income as number) >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">Invoices</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Invoiced</span><span className="font-medium">{fmtCurrency(invoices?.invoiced_total as number)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Collected</span><span className="font-medium text-green-600">{fmtCurrency(invoices?.collected as number)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Outstanding</span><span className="font-medium text-orange-600">{fmtCurrency(invoices?.outstanding as number)}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">Expenses by Category</h4>
          {byCategory.map(c => (
            <div key={c.category as string} className="flex justify-between py-1.5 text-sm">
              <span className="text-gray-700 capitalize">{c.category as string}</span>
              <span className="font-medium">{fmtCurrency(c.cat_total as number)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GuestReport({ data }: { data: Record<string, unknown> }) {
  const guests = (data.guests as Array<Record<string, unknown>>) || [];

  return (
    <DataTable rows={guests} columns={[
      { key: 'name', label: 'Guest' },
      { key: 'email', label: 'Email' },
      { key: 'company', label: 'Company' },
      { key: 'period_bookings', label: 'Period Bookings' },
      { key: 'total_bookings', label: 'All-time Bookings' },
      { key: 'total_revenue', label: 'Total Revenue', fmt: v => fmtCurrency(v as number) },
    ]} />
  );
}

/* ============ Shared components ============ */

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function DataTable({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: Array<{ key: string; label: string; fmt?: (v: unknown) => string }> }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-gray-500">No data for this period</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            {columns.map(col => <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-gray-700">
                  {col.fmt ? col.fmt(row[col.key]) : String(row[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
