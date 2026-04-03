import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { PlatformBadge } from '../components/PlatformBadge.tsx';
import type { Platform, BookingStatus } from '@studioflow360/shared';

interface DashboardMessage {
  id: string;
  booking_id: string;
  channel: 'sms' | 'whatsapp';
  from_number: string;
  body: string;
  is_read: number;
  created_at: string;
  guest_name: string | null;
}

interface DashboardData {
  today: { booking_count: number; revenue: number };
  pending_action: number;
  stale_approvals: number;
  unread_messages: number;
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
  recent_messages: DashboardMessage[];
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

const EVENT_ICONS: Record<string, string> = {
  RECEIVED: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  PARSED: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
  APPROVED: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  REJECTED: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  CONFIRMED: 'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
  NOTE_ADDED: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
  ASSIGNED: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  PLATFORM_ACTIONED: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
  CANCELLED: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
};

const EVENT_COLORS: Record<string, string> = {
  RECEIVED: 'text-gray-400 bg-gray-50',
  PARSED: 'text-blue-500 bg-blue-50',
  ASSIGNED: 'text-indigo-500 bg-indigo-50',
  APPROVED: 'text-emerald-500 bg-emerald-50',
  REJECTED: 'text-red-500 bg-red-50',
  PLATFORM_ACTIONED: 'text-orange-500 bg-orange-50',
  CONFIRMED: 'text-emerald-600 bg-emerald-50',
  CANCELLED: 'text-gray-500 bg-gray-100',
  NOTE_ADDED: 'text-amber-500 bg-amber-50',
};

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
        <div className="skeleton h-12 w-72" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 skeleton h-80" />
          <div className="skeleton h-80" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
            {greeting}, {staff?.displayName?.split(' ')[0]}
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Link
          to="/inbox"
          className="self-start rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          View inbox
        </Link>
      </div>

      {/* KPI Strip */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Bookings today" value={String(data.today.booking_count)} color="blue" />
        <KpiCard
          label="Revenue today"
          value={`\u00A3${data.today.revenue.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`}
          color="emerald"
        />
        <KpiCard
          label="Pending actions"
          value={String(data.pending_action)}
          color={data.pending_action > 0 ? 'amber' : 'gray'}
          alert={data.pending_action > 0}
        />
        <KpiCard
          label="Unread messages"
          value={String(data.unread_messages)}
          color={data.unread_messages > 0 ? 'purple' : 'gray'}
          alert={data.unread_messages > 0}
        />
        <KpiCard
          label="Stale approvals"
          value={String(data.stale_approvals)}
          color={data.stale_approvals > 0 ? 'red' : 'gray'}
          alert={data.stale_approvals > 0}
        />
      </div>

      {/* Alerts */}
      {data.stale_approvals > 0 && (
        <Link
          to="/action-queue"
          className="mb-5 flex items-center gap-3 rounded-xl border border-red-200/60 bg-gradient-to-r from-red-50 to-white px-5 py-3.5 transition-colors hover:border-red-300"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-900">
              {data.stale_approvals} approval{data.stale_approvals > 1 ? 's' : ''} waiting over 2 hours
            </p>
          </div>
          <svg className="h-4 w-4 shrink-0 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      )}

      {data.studio_overdue > 0 && (
        <Link
          to="/studio"
          className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-white px-5 py-3.5 transition-colors hover:border-amber-300"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1 5.1a2.121 2.121 0 01-3-3l5.1-5.1" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              {data.studio_overdue} overdue studio item{data.studio_overdue > 1 ? 's' : ''}
            </p>
          </div>
          <svg className="h-4 w-4 shrink-0 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Upcoming Bookings */}
        <div className="lg:col-span-2 rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming Bookings</h2>
            <Link to="/calendar" className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-700">
              Calendar &rarr;
            </Link>
          </div>

          {data.upcoming.length === 0 ? (
            <div className="border-t border-gray-100 px-5 py-16 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500">No upcoming bookings</p>
              <p className="mt-0.5 text-xs text-gray-400">New bookings will appear here</p>
            </div>
          ) : (
            <div className="border-t border-gray-100">
              {data.upcoming.map((b, i) => (
                <Link
                  key={b.id}
                  to={`/bookings/${b.id}`}
                  className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/80 ${
                    i > 0 ? 'border-t border-gray-50' : ''
                  }`}
                >
                  <PlatformBadge platform={b.platform as Platform} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{b.guest_name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatDate(b.booking_date)} &middot; {b.start_time}&ndash;{b.end_time}
                      {b.coordinator_name && <> &middot; {b.coordinator_name}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {b.room_name && (
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase"
                        style={{ backgroundColor: b.room_color ?? '#6B7280' }}
                      >
                        {b.room_name}
                      </span>
                    )}
                    {b.total_price != null && (
                      <span className="text-xs font-semibold tabular-nums text-gray-700">
                        &pound;{b.total_price.toLocaleString('en-GB', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                    <StatusBadge status={b.status as BookingStatus} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Messages */}
          <div className="rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Messages</h3>
                {data.unread_messages > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 text-[10px] font-bold text-white">
                    {data.unread_messages}
                  </span>
                )}
              </div>
            </div>
            <div className="border-t border-gray-100">
              {data.recent_messages.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-500">No messages yet</p>
                  <p className="mt-0.5 text-xs text-gray-400">Inbound SMS &amp; WhatsApp will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.recent_messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                        msg.booking_id !== '__UNLINKED__' ? 'cursor-pointer hover:bg-gray-50/80' : ''
                      } ${!msg.is_read ? 'bg-purple-50/40' : ''}`}
                      onClick={() => {
                        if (msg.booking_id !== '__UNLINKED__') {
                          window.location.href = `/bookings/${msg.booking_id}`;
                        }
                      }}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        msg.channel === 'whatsapp' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {msg.channel === 'whatsapp' ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-medium text-gray-800">
                            {msg.guest_name ?? msg.from_number}
                          </p>
                          {!msg.is_read && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">{msg.body}</p>
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                        {timeAgo(msg.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Room Occupancy */}
          <div className="rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Room Occupancy</h3>
              <p className="text-[11px] text-gray-400">Today&apos;s utilisation</p>
            </div>
            <div className="border-t border-gray-100 px-5 py-4 space-y-4">
              {data.room_occupancy.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No rooms configured</p>
              ) : data.room_occupancy.map((room) => {
                const pct = Math.min((room.booked_hours / 12) * 100, 100);
                return (
                  <div key={room.id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: room.color_hex }} />
                        <span className="text-xs font-medium text-gray-700">{room.name}</span>
                      </div>
                      <span className="text-[11px] tabular-nums text-gray-400">
                        {room.booked_hours.toFixed(1)}h / 12h
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct > 80 ? '#ef4444' : room.color_hex,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Activity</h3>
            </div>
            <div className="border-t border-gray-100">
              {data.recent_activity.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-xs text-gray-400">No activity yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.recent_activity.map((event) => {
                    const iconPath = EVENT_ICONS[event.event_type] ?? EVENT_ICONS.RECEIVED!;
                    const colorCls = EVENT_COLORS[event.event_type] ?? EVENT_COLORS.RECEIVED!;
                    return (
                      <Link
                        key={event.id}
                        to={`/bookings/${event.booking_id}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50/80"
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorCls}`}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-800">
                            {formatEventType(event.event_type)}
                          </p>
                          <p className="truncate text-[11px] text-gray-400">
                            {event.guest_name} &middot; {event.actor_name ?? 'System'}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                          {timeAgo(event.created_at)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatEventType(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
}

// --- KPI Card ---

const COLOR_MAP: Record<string, { text: string; indicator: string }> = {
  blue:    { text: 'text-gray-900', indicator: 'bg-blue-500' },
  emerald: { text: 'text-gray-900', indicator: 'bg-emerald-500' },
  amber:   { text: 'text-gray-900', indicator: 'bg-amber-500' },
  purple:  { text: 'text-gray-900', indicator: 'bg-purple-500' },
  red:     { text: 'text-gray-900', indicator: 'bg-red-500' },
  gray:    { text: 'text-gray-400', indicator: 'bg-gray-300' },
};

function KpiCard({ label, value, color, alert }: {
  label: string; value: string; color: string; alert?: boolean;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.gray!;
  return (
    <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-gray-950/[0.04] shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-1.5 w-1.5 rounded-full ${c.indicator} ${alert ? 'animate-pulse' : ''}`} />
        <p className="text-xs font-medium text-gray-400">{label}</p>
      </div>
      <p className={`text-2xl font-semibold tabular-nums tracking-tight ${c.text}`}>{value}</p>
    </div>
  );
}
