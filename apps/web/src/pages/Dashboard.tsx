import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import type { Platform, BookingStatus } from '@studioflow360/shared';

interface DashboardData {
  today: { booking_count: number; revenue: number };
  pending_action: number;
  stale_approvals: number;
  upcoming: Array<{
    id: string; guest_name: string; booking_date: string; start_time: string;
    end_time: string; status: string; platform: string; total_price: number | null;
    currency: string | null; room_name: string | null; room_color: string | null;
    coordinator_name: string | null;
  }>;
  recent_activity: Array<{
    id: string; event_type: string; created_at: string; booking_id: string;
    guest_name: string; actor_name: string | null;
  }>;
  room_occupancy: Array<{
    id: string; name: string; color_hex: string; booking_count: number; booked_hours: number;
  }>;
  studio_overdue: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DashboardPage() {
  const { staff } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardData>('/dashboard').then((res) => {
      if (res.success && res.data) setData(res.data);
      setLoading(false);
    });
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="skeleton h-16" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-28" />)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="skeleton h-80" />
          <div className="skeleton h-80" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: "Today's Bookings", value: data.today.booking_count, accent: 'blue', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
    { label: "Today's Revenue", value: `\u00A3${data.today.revenue.toFixed(0)}`, accent: 'emerald', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
    { label: 'Pending Actions', value: data.pending_action, accent: data.pending_action > 0 ? 'amber' : 'gray', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Stale Approvals', value: data.stale_approvals, accent: data.stale_approvals > 0 ? 'red' : 'gray', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
  ];

  const accentColors: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconBg: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', iconBg: 'bg-amber-100' },
    red: { bg: 'bg-red-50', text: 'text-red-700', iconBg: 'bg-red-100' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-500', iconBg: 'bg-gray-100' },
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{greeting}, {staff?.displayName?.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const colors = accentColors[stat.accent] ?? accentColors.gray!;
          return (
            <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{stat.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${colors.text}`}>{stat.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.iconBg}`}>
                  <svg className={`h-5 w-5 ${colors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={stat.icon} />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Upcoming Bookings */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming Bookings</h2>
            <Link to="/inbox" className="text-xs font-medium text-blue-600 hover:text-blue-700">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {data.upcoming.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">No upcoming bookings</div>
            ) : data.upcoming.map((b) => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <PlatformBadge platform={b.platform as Platform} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{b.guest_name}</p>
                    <p className="text-[11px] text-gray-400">
                      {b.booking_date} {'\u00B7'} {b.start_time}{'\u2013'}{b.end_time}
                      {b.coordinator_name && ` \u00B7 ${b.coordinator_name}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {b.room_name && (
                    <span className="rounded-md px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: b.room_color ?? '#6B7280' }}>
                      {b.room_name}
                    </span>
                  )}
                  {b.total_price != null && (
                    <span className="text-xs font-semibold text-gray-700">{'\u00A3'}{b.total_price.toFixed(0)}</span>
                  )}
                  <StatusBadge status={b.status as BookingStatus} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Room Occupancy Today */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Room Occupancy Today</h3>
            {data.room_occupancy.length === 0 ? (
              <p className="text-sm text-gray-400">No rooms configured</p>
            ) : (
              <div className="space-y-3">
                {data.room_occupancy.map((room) => (
                  <div key={room.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded" style={{ backgroundColor: room.color_hex }} />
                        <span className="font-medium text-gray-700">{room.name}</span>
                      </div>
                      <span className="text-gray-400">{room.booking_count} booking{room.booking_count !== 1 ? 's' : ''} ({room.booked_hours.toFixed(1)}h)</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min((room.booked_hours / 12) * 100, 100)}%`, backgroundColor: room.color_hex }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          {(data.studio_overdue > 0) && (
            <Link to="/studio" className="block rounded-xl border border-red-200 bg-red-50 p-4 transition-colors hover:bg-red-100">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                  <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-800">{data.studio_overdue} overdue studio item{data.studio_overdue !== 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-red-600">Requires attention</p>
                </div>
              </div>
            </Link>
          )}

          {/* Recent Activity */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Activity</h3>
            {data.recent_activity.length === 0 ? (
              <p className="text-sm text-gray-400">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {data.recent_activity.map((event) => (
                  <Link key={event.id} to={`/bookings/${event.booking_id}`} className="block rounded-lg p-2 transition-colors hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{event.event_type.replace(/_/g, ' ')}</p>
                        <p className="text-[11px] text-gray-400">{event.guest_name} {'\u00B7'} {event.actor_name ?? 'System'}</p>
                      </div>
                      <span className="text-[11px] text-gray-400">{timeAgo(event.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
