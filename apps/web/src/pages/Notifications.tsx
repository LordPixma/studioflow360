import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../components/Toast.tsx';

const API = '/api/notifications';

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  booking_new: { icon: '📥', color: 'bg-blue-100' },
  booking_status: { icon: '📋', color: 'bg-blue-50' },
  booking_assigned: { icon: '👤', color: 'bg-indigo-100' },
  task_assigned: { icon: '✅', color: 'bg-green-100' },
  task_due: { icon: '⏰', color: 'bg-orange-100' },
  task_completed: { icon: '🎉', color: 'bg-green-50' },
  time_off_request: { icon: '🏖️', color: 'bg-yellow-100' },
  time_off_reviewed: { icon: '📝', color: 'bg-yellow-50' },
  contract_signed: { icon: '✍️', color: 'bg-purple-100' },
  quote_accepted: { icon: '💰', color: 'bg-green-100' },
  inventory_low_stock: { icon: '📦', color: 'bg-red-100' },
  document_uploaded: { icon: '📄', color: 'bg-cyan-100' },
  comment_added: { icon: '💬', color: 'bg-gray-100' },
  system: { icon: '⚙️', color: 'bg-gray-100' },
};

interface Notification {
  id: string; recipient_id: string; type: string;
  title: string; body: string | null; link: string | null;
  is_read: number; entity_type: string | null; entity_id: string | null;
  created_at: string;
}

interface ActivityItem {
  id: string; actor_id: string | null; actor_name: string | null;
  action: string; entity_type: string; entity_id: string | null;
  entity_label: string | null; details: string | null; created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<'notifications' | 'activity'>('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const params = new URLSearchParams({ per_page: '100' });
    if (showUnreadOnly) params.set('unread_only', '1');
    const res = await fetch(`${API}?${params}`);
    const json = await res.json() as { success: boolean; data: Notification[] };
    if (json.success) setNotifications(json.data);
  }, [showUnreadOnly]);

  const fetchUnreadCount = useCallback(async () => {
    const res = await fetch(`${API}/unread-count`);
    const json = await res.json() as { success: boolean; data: { count: number } };
    if (json.success) setUnreadCount(json.data.count);
  }, []);

  const fetchActivity = useCallback(async () => {
    const res = await fetch(`${API}/activity?per_page=100`);
    const json = await res.json() as { success: boolean; data: ActivityItem[] };
    if (json.success) setActivity(json.data);
  }, []);

  useEffect(() => {
    Promise.all([fetchNotifications(), fetchUnreadCount(), fetchActivity()]).finally(() => setLoading(false));
  }, [fetchNotifications, fetchUnreadCount, fetchActivity]);

  const markAsRead = async (id: string) => {
    await fetch(`${API}/${id}/read`, { method: 'PATCH' });
    fetchNotifications(); fetchUnreadCount();
  };

  const markAllRead = async () => {
    await fetch(`${API}/mark-all-read`, { method: 'POST' });
    toast('All marked as read', 'success');
    fetchNotifications(); fetchUnreadCount();
  };

  const clearRead = async () => {
    await fetch(`${API}/clear`, { method: 'POST' });
    toast('Read notifications cleared', 'success');
    fetchNotifications();
  };

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) navigate(notif.link);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100">
              Mark all read
            </button>
          )}
          <button onClick={clearRead} className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Clear read
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setTab('notifications')}
          className={`pb-3 text-sm font-medium transition-colors ${tab === 'notifications' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Notifications {unreadCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{unreadCount}</span>}
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`pb-3 text-sm font-medium transition-colors ${tab === 'activity' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Activity Log
        </button>
      </div>

      {tab === 'notifications' && (
        <>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              Unread only
            </label>
          </div>

          {notifications.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
              <p className="text-4xl">🔔</p>
              <p className="mt-3 text-gray-500">No notifications</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map(notif => {
                const typeInfo = TYPE_ICONS[notif.type] ?? TYPE_ICONS.system!;
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-gray-50 ${notif.is_read ? 'border-gray-50 bg-white' : 'border-blue-100 bg-blue-50/30'}`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${typeInfo!.color}`}>
                      {typeInfo!.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${notif.is_read ? 'text-gray-700' : 'font-medium text-gray-900'}`}>{notif.title}</p>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] text-gray-400">{timeAgo(notif.created_at)}</span>
                          {!notif.is_read && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                        </div>
                      </div>
                      {notif.body && <p className="mt-0.5 text-xs text-gray-500">{notif.body}</p>}
                      {notif.link && <p className="mt-1 text-[10px] text-blue-500">Click to view</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'activity' && (
        <>
          {activity.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-0">
              {activity.map((item, idx) => (
                <div key={item.id} className="flex gap-4">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-gray-300 mt-2" />
                    {idx < activity.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                  </div>
                  {/* Content */}
                  <div className="pb-4 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{item.actor_name || 'System'}</span>
                      {' '}{item.action}
                      {item.entity_label && <span className="font-medium"> {item.entity_label}</span>}
                    </p>
                    {item.details && <p className="mt-0.5 text-xs text-gray-500">{item.details}</p>}
                    <p className="mt-0.5 text-[10px] text-gray-400">{timeAgo(item.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
