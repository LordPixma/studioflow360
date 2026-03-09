import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast.tsx';

const API = '/api/marketing';

interface Promotion { id: string; name: string; description: string | null; promo_type: string; discount_value: number; valid_from: string; valid_to: string | null; usage_limit: number | null; times_used: number; is_active: number; }
interface Campaign { id: string; name: string; description: string | null; campaign_type: string; status: string; scheduled_at: string | null; sent_at: string | null; recipients_count: number; opened_count: number; clicked_count: number; created_at: string; }
interface PortalConfig { welcome_message: string | null; booking_instructions: string | null; cancellation_policy: string | null; show_pricing: number; show_availability: number; require_approval: number; }
interface Stats { active_promotions: number; active_codes: number; total_campaigns: number; sent_campaigns: number; total_promo_uses: number; }

const PROMO_TYPE_LABELS: Record<string, string> = { percentage: '% Off', fixed_amount: '$ Off', free_hours: 'Free Hours', package: 'Package' };
const STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', scheduled: 'bg-blue-100 text-blue-700', sending: 'bg-yellow-100 text-yellow-700', sent: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' };

export function MarketingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'promotions' | 'campaigns' | 'portal'>('promotions');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [portal, setPortal] = useState<PortalConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, porRes, sRes] = await Promise.all([
        fetch(`${API}/promotions`), fetch(`${API}/campaigns`), fetch(`${API}/portal`), fetch(`${API}/stats`),
      ]);
      const [pJ, cJ, porJ, sJ] = await Promise.all([pRes.json(), cRes.json(), porRes.json(), sRes.json()]) as [
        { success: boolean; data: Promotion[] }, { success: boolean; data: Campaign[] },
        { success: boolean; data: PortalConfig }, { success: boolean; data: Stats },
      ];
      if (pJ.success) setPromotions(pJ.data);
      if (cJ.success) setCampaigns(cJ.data);
      if (porJ.success) setPortal(porJ.data);
      if (sJ.success) setStats(sJ.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const togglePromo = async (id: string, active: number) => {
    await fetch(`${API}/promotions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active ? 0 : 1 }) });
    toast(active ? 'Promotion disabled' : 'Promotion enabled', 'success');
    fetchAll();
  };

  const deletePromo = async (id: string) => {
    await fetch(`${API}/promotions/${id}`, { method: 'DELETE' });
    toast('Promotion deleted', 'success');
    fetchAll();
  };

  const deleteCampaign = async (id: string) => {
    await fetch(`${API}/campaigns/${id}`, { method: 'DELETE' });
    toast('Campaign deleted', 'success');
    fetchAll();
  };

  const savePortal = async () => {
    if (!portal) return;
    await fetch(`${API}/portal`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(portal) });
    toast('Portal settings saved', 'success');
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing & Promotions</h1>
        <p className="text-sm text-gray-500">Manage promotions, campaigns, and guest portal</p>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <SC label="Active Promos" value={stats.active_promotions} />
          <SC label="Promo Codes" value={stats.active_codes} />
          <SC label="Campaigns" value={stats.total_campaigns} />
          <SC label="Sent" value={stats.sent_campaigns} />
          <SC label="Total Uses" value={stats.total_promo_uses ?? 0} />
        </div>
      )}

      <div className="flex items-center gap-4 border-b border-gray-200">
        {(['promotions', 'campaigns', 'portal'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'portal' ? 'Guest Portal' : t}
          </button>
        ))}
      </div>

      {tab === 'promotions' && (
        <div className="space-y-2">
          {promotions.length === 0 ? <Empty msg="No promotions yet" /> : promotions.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                    {p.discount_value}{PROMO_TYPE_LABELS[p.promo_type] ?? p.promo_type}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {p.valid_from}{p.valid_to ? ` - ${p.valid_to}` : ' onwards'} | Used {p.times_used}{p.usage_limit ? `/${p.usage_limit}` : ''} times
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => togglePromo(p.id, p.is_active)} className={`rounded-lg px-2.5 py-1 font-medium ${p.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'}`}>
                  {p.is_active ? 'Active' : 'Disabled'}
                </button>
                <button onClick={() => deletePromo(p.id)} className="text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="space-y-2">
          {campaigns.length === 0 ? <Empty msg="No campaigns yet" /> : campaigns.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{c.campaign_type}</span>
                </div>
                {c.description && <p className="mt-0.5 text-xs text-gray-400">{c.description}</p>}
                <p className="mt-0.5 text-xs text-gray-500">
                  {c.recipients_count} recipients | {c.opened_count} opens | {c.clicked_count} clicks
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {c.scheduled_at && <span className="text-gray-400">Scheduled: {c.scheduled_at.split('T')[0]}</span>}
                <button onClick={() => deleteCampaign(c.id)} className="text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'portal' && portal && (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Guest Portal Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Welcome Message</label>
              <textarea value={portal.welcome_message ?? ''} onChange={e => setPortal({ ...portal, welcome_message: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Booking Instructions</label>
              <textarea value={portal.booking_instructions ?? ''} onChange={e => setPortal({ ...portal, booking_instructions: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Cancellation Policy</label>
              <textarea value={portal.cancellation_policy ?? ''} onChange={e => setPortal({ ...portal, cancellation_policy: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!portal.show_pricing} onChange={e => setPortal({ ...portal, show_pricing: e.target.checked ? 1 : 0 })} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              Show Pricing
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!portal.show_availability} onChange={e => setPortal({ ...portal, show_availability: e.target.checked ? 1 : 0 })} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              Show Availability
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!portal.require_approval} onChange={e => setPortal({ ...portal, require_approval: e.target.checked ? 1 : 0 })} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              Require Approval
            </label>
          </div>
          <button onClick={savePortal} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Save Portal Settings</button>
        </div>
      )}
    </div>
  );
}

function SC({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm"><p className="text-sm text-gray-500">{msg}</p></div>;
}
