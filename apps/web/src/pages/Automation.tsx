import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast.tsx';

const API = '/api/automation';

interface EmailTemplate { id: string; name: string; subject: string; body_html: string; template_type: string; is_active: number; updated_at: string; }
interface AutoRule { id: string; name: string; description: string | null; trigger_type: string; action_type: string; is_active: number; run_count: number; last_run_at: string | null; template_name: string | null; updated_at: string; }
interface LogEntry { id: string; rule_name: string; trigger_type: string; action_type: string; status: string; details: string | null; error: string | null; created_at: string; }
interface Stats { active_rules: number; total_rules: number; active_templates: number; runs_last_7d: number; failures_last_7d: number; }

const TRIGGER_LABELS: Record<string, string> = {
  booking_created: 'Booking Created', booking_approved: 'Booking Approved', booking_rejected: 'Booking Rejected',
  booking_confirmed: 'Booking Confirmed', booking_cancelled: 'Booking Cancelled', booking_stale: 'Stale Booking',
  guest_created: 'New Guest', task_overdue: 'Task Overdue', inventory_low_stock: 'Low Stock',
  contract_signed: 'Contract Signed', quote_accepted: 'Quote Accepted', time_off_approved: 'Time Off Approved', scheduled: 'Scheduled',
};
const ACTION_LABELS: Record<string, string> = {
  send_email: 'Send Email', send_notification: 'Send Notification', create_task: 'Create Task',
  update_booking_status: 'Update Booking', assign_staff: 'Assign Staff', create_invoice: 'Create Invoice',
  webhook: 'Call Webhook', log_activity: 'Log Activity',
};

function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.floor(m / 60)}h ago`; return `${Math.floor(m / 1440)}d ago`; }

export function AutomationPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'rules' | 'templates' | 'log'>('rules');
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, tplRes, logRes, statsRes] = await Promise.all([
        fetch(`${API}/rules`), fetch(`${API}/templates`), fetch(`${API}/log?per_page=50`), fetch(`${API}/stats`),
      ]);
      const [rulesJ, tplJ, logJ, statsJ] = await Promise.all([rulesRes.json(), tplRes.json(), logRes.json(), statsRes.json()]) as [
        { success: boolean; data: AutoRule[] }, { success: boolean; data: EmailTemplate[] },
        { success: boolean; data: LogEntry[] }, { success: boolean; data: Stats },
      ];
      if (rulesJ.success) setRules(rulesJ.data);
      if (tplJ.success) setTemplates(tplJ.data);
      if (logJ.success) setLog(logJ.data);
      if (statsJ.success) setStats(statsJ.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleRule = async (id: string, active: number) => {
    await fetch(`${API}/rules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active ? 0 : 1 }) });
    toast(active ? 'Rule disabled' : 'Rule enabled', 'success');
    fetchAll();
  };

  const deleteRule = async (id: string) => {
    await fetch(`${API}/rules/${id}`, { method: 'DELETE' });
    toast('Rule deleted', 'success');
    fetchAll();
  };

  const deleteTemplate = async (id: string) => {
    await fetch(`${API}/templates/${id}`, { method: 'DELETE' });
    toast('Template deleted', 'success');
    fetchAll();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Automation</h1>
        <p className="text-sm text-gray-500">Email templates, triggers, and workflow rules</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Active Rules" value={stats.active_rules} total={stats.total_rules} />
          <StatCard label="Email Templates" value={stats.active_templates} />
          <StatCard label="Runs (7d)" value={stats.runs_last_7d} />
          <StatCard label="Failures (7d)" value={stats.failures_last_7d} color={stats.failures_last_7d > 0 ? 'text-red-600' : undefined} />
          <StatCard label="Success Rate" value={stats.runs_last_7d > 0 ? `${Math.round(((stats.runs_last_7d - stats.failures_last_7d) / stats.runs_last_7d) * 100)}%` : '-'} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        {(['rules', 'templates', 'log'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'log' ? 'Activity Log' : t}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="space-y-2">
          {rules.length === 0 ? <Empty msg="No automation rules configured" /> : rules.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${r.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  When <span className="font-medium text-blue-600">{TRIGGER_LABELS[r.trigger_type] ?? r.trigger_type}</span> then <span className="font-medium text-indigo-600">{ACTION_LABELS[r.action_type] ?? r.action_type}</span>
                  {r.template_name && <span className="text-gray-400"> (tpl: {r.template_name})</span>}
                </p>
                {r.description && <p className="mt-0.5 text-xs text-gray-400">{r.description}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">{r.run_count} runs</span>
                {r.last_run_at && <span className="text-gray-400">{timeAgo(r.last_run_at)}</span>}
                <button onClick={() => toggleRule(r.id, r.is_active)} className={`rounded-lg px-2.5 py-1 font-medium ${r.is_active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  {r.is_active ? 'Active' : 'Disabled'}
                </button>
                <button onClick={() => deleteRule(r.id)} className="text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-2">
          {templates.length === 0 ? <Empty msg="No email templates yet" /> : templates.map(t => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${t.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{t.template_type}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">Subject: {t.subject}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">{timeAgo(t.updated_at)}</span>
                <button onClick={() => deleteTemplate(t.id)} className="text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {log.length === 0 ? <Empty msg="No automation activity yet" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Rule</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Trigger</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">When</th>
              </tr></thead>
              <tbody>
                {log.map(l => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{l.rule_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{TRIGGER_LABELS[l.trigger_type] ?? l.trigger_type}</td>
                    <td className="px-4 py-2.5 text-gray-600">{ACTION_LABELS[l.action_type] ?? l.action_type}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'success' ? 'bg-green-100 text-green-700' : l.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{l.status}</span>
                    </td>
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

function StatCard({ label, value, total, color }: { label: string; value: number | string; total?: number; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}{total !== undefined && <span className="text-sm font-normal text-gray-400">/{total}</span>}</p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm"><p className="text-sm text-gray-500">{msg}</p></div>;
}
