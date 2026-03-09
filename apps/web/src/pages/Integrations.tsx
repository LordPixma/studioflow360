import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast.tsx';

const API = '/api/integrations';

interface Integration { id: string; name: string; integration_type: string; status: string; config: string; last_sync_at: string | null; sync_error: string | null; is_active: number; }
interface WebhookEndpoint { id: string; name: string; url: string; events: string; is_active: number; last_triggered_at: string | null; failure_count: number; }
interface WebhookLog { id: string; endpoint_name: string; event_type: string; response_status: number | null; status: string; duration_ms: number | null; created_at: string; }
interface Stats { active_integrations: number; errored_integrations: number; active_webhooks: number; webhook_calls_7d: number; webhook_failures_7d: number; }

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  google_calendar: { icon: '📅', color: 'bg-blue-50' }, outlook: { icon: '📧', color: 'bg-blue-100' },
  stripe: { icon: '💳', color: 'bg-purple-50' }, xero: { icon: '📊', color: 'bg-cyan-50' },
  quickbooks: { icon: '📒', color: 'bg-green-50' }, slack: { icon: '💬', color: 'bg-yellow-50' },
  zapier: { icon: '⚡', color: 'bg-orange-50' }, custom_webhook: { icon: '🔗', color: 'bg-gray-50' },
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700',
};

function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.floor(m / 60)}h ago`; return `${Math.floor(m / 1440)}d ago`; }

export function IntegrationsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'integrations' | 'webhooks' | 'log'>('integrations');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [whLog, setWhLog] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, wRes, lRes, sRes] = await Promise.all([
        fetch(API), fetch(`${API}/webhooks/endpoints`), fetch(`${API}/webhooks/log?per_page=50`), fetch(`${API}/stats`),
      ]);
      const [iJ, wJ, lJ, sJ] = await Promise.all([iRes.json(), wRes.json(), lRes.json(), sRes.json()]) as [
        { success: boolean; data: Integration[] }, { success: boolean; data: WebhookEndpoint[] },
        { success: boolean; data: WebhookLog[] }, { success: boolean; data: Stats },
      ];
      if (iJ.success) setIntegrations(iJ.data);
      if (wJ.success) setWebhooks(wJ.data);
      if (lJ.success) setWhLog(lJ.data);
      if (sJ.success) setStats(sJ.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleIntegration = async (id: string, active: number) => {
    await fetch(`${API}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active ? 0 : 1 }) });
    toast(active ? 'Integration disabled' : 'Integration enabled', 'success');
    fetchAll();
  };

  const deleteIntegration = async (id: string) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    toast('Integration removed', 'success');
    fetchAll();
  };

  const deleteWebhook = async (id: string) => {
    await fetch(`${API}/webhooks/endpoints/${id}`, { method: 'DELETE' });
    toast('Webhook removed', 'success');
    fetchAll();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations Hub</h1>
        <p className="text-sm text-gray-500">Connect external services and manage webhooks</p>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <SC label="Active" value={stats.active_integrations} />
          <SC label="Errors" value={stats.errored_integrations} color={stats.errored_integrations > 0 ? 'text-red-600' : undefined} />
          <SC label="Webhooks" value={stats.active_webhooks} />
          <SC label="Calls (7d)" value={stats.webhook_calls_7d} />
          <SC label="Failures (7d)" value={stats.webhook_failures_7d} color={stats.webhook_failures_7d > 0 ? 'text-red-600' : undefined} />
        </div>
      )}

      <div className="flex items-center gap-4 border-b border-gray-200">
        {(['integrations', 'webhooks', 'log'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'log' ? 'Webhook Log' : t}
          </button>
        ))}
      </div>

      {tab === 'integrations' && (
        <div className="grid grid-cols-2 gap-4">
          {integrations.length === 0 ? <div className="col-span-2"><Empty msg="No integrations configured" /></div> : integrations.map(i => {
            const typeInfo = TYPE_ICONS[i.integration_type] ?? TYPE_ICONS.custom_webhook!;
            return (
              <div key={i.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${typeInfo.color}`}>{typeInfo.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{i.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{i.integration_type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[i.status] ?? 'bg-gray-100 text-gray-600'}`}>{i.status}</span>
                </div>
                {i.sync_error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">{i.sync_error}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{i.last_sync_at ? `Last sync: ${timeAgo(i.last_sync_at)}` : 'Never synced'}</span>
                  <div className="flex gap-2">
                    <button onClick={() => toggleIntegration(i.id, i.is_active)} className="text-xs text-blue-600 hover:text-blue-700">
                      {i.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => deleteIntegration(i.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'webhooks' && (
        <div className="space-y-2">
          {webhooks.length === 0 ? <Empty msg="No webhook endpoints configured" /> : webhooks.map(w => {
            const events = JSON.parse(w.events) as string[];
            return (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${w.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <p className="text-sm font-semibold text-gray-900">{w.name}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 font-mono">{w.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {events.map(e => <span key={e} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{e}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {w.failure_count > 0 && <span className="text-red-500">{w.failure_count} failures</span>}
                  {w.last_triggered_at && <span className="text-gray-400">{timeAgo(w.last_triggered_at)}</span>}
                  <button onClick={() => deleteWebhook(w.id)} className="text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'log' && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {whLog.length === 0 ? <Empty msg="No webhook activity yet" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Endpoint</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Event</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">HTTP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">When</th>
              </tr></thead>
              <tbody>
                {whLog.map(l => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{l.endpoint_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{l.event_type}</td>
                    <td className="px-4 py-2.5 text-gray-600">{l.response_status ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'success' ? 'bg-green-100 text-green-700' : l.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{l.duration_ms != null ? `${l.duration_ms}ms` : '-'}</td>
                    <td className="px-4 py-2.5 text-gray-400">{timeAgo(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function SC({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p></div>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm"><p className="text-sm text-gray-500">{msg}</p></div>;
}
