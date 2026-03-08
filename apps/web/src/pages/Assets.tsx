import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { usePermission } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';
import type { AssetRow, RoomRow } from '@studioflow360/shared';

type AssetWithJoins = AssetRow & { room_name: string | null; room_color: string | null; creator_name: string | null; assignee_name: string | null };

interface AssetSummary {
  by_category: { category: string; count: number; total_value: number }[];
  by_status: { status: string; count: number }[];
  total_value: { total: number; original: number } | null;
  warranty_expiring_soon: number;
}

const ASSET_CATEGORIES = ['equipment', 'furniture', 'electronics', 'software', 'vehicle', 'other'] as const;
const ASSET_STATUSES = ['active', 'maintenance', 'retired', 'disposed', 'lost'] as const;

const categoryColors: Record<string, string> = {
  equipment: 'bg-blue-100 text-blue-700',
  furniture: 'bg-amber-100 text-amber-700',
  electronics: 'bg-purple-100 text-purple-700',
  software: 'bg-emerald-100 text-emerald-700',
  vehicle: 'bg-rose-100 text-rose-700',
  other: 'bg-gray-100 text-gray-600',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  maintenance: 'bg-amber-100 text-amber-700',
  retired: 'bg-gray-100 text-gray-600',
  disposed: 'bg-red-100 text-red-700',
  lost: 'bg-red-100 text-red-700',
};

export function AssetsPage() {
  const { toast } = useToast();
  const canManage = usePermission('assets.manage');
  const [assets, setAssets] = useState<AssetWithJoins[]>([]);
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [_staffList, setStaffList] = useState<{ id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [newAsset, setNewAsset] = useState({
    name: '', category: 'equipment' as string, serial_number: '', model: '', manufacturer: '',
    purchase_date: '', purchase_price: 0, current_value: 0, location: '', room_id: '', assigned_to: '',
    warranty_expiry: '', notes: '',
  });

  const fetchAssets = async () => {
    const params = new URLSearchParams();
    if (filterCategory) params.set('category', filterCategory);
    if (filterStatus) params.set('status', filterStatus);
    const res = await api.get<AssetWithJoins[]>(`/assets?${params}`);
    if (res.success && res.data) setAssets(res.data as AssetWithJoins[]);
    setLoading(false);
  };

  const fetchSummary = async () => {
    const res = await api.get<AssetSummary>('/assets/summary');
    if (res.success && res.data) setSummary(res.data);
  };

  useEffect(() => {
    fetchAssets(); fetchSummary();
    api.get<RoomRow[]>('/rooms').then(r => { if (r.success && r.data) setRooms(r.data); });
    api.get<{ id: string; display_name: string }[]>('/staff/list').then(r => { if (r.success && r.data) setStaffList(r.data); });
  }, []);

  useEffect(() => { fetchAssets(); }, [filterCategory, filterStatus]);

  const addAsset = async () => {
    if (!newAsset.name.trim()) return;
    const payload: Record<string, unknown> = { name: newAsset.name, category: newAsset.category };
    if (newAsset.serial_number) payload.serial_number = newAsset.serial_number;
    if (newAsset.model) payload.model = newAsset.model;
    if (newAsset.manufacturer) payload.manufacturer = newAsset.manufacturer;
    if (newAsset.purchase_date) payload.purchase_date = newAsset.purchase_date;
    if (newAsset.purchase_price) payload.purchase_price = newAsset.purchase_price;
    if (newAsset.current_value) payload.current_value = newAsset.current_value;
    if (newAsset.location) payload.location = newAsset.location;
    if (newAsset.room_id) payload.room_id = newAsset.room_id;
    if (newAsset.assigned_to) payload.assigned_to = newAsset.assigned_to;
    if (newAsset.warranty_expiry) payload.warranty_expiry = newAsset.warranty_expiry;
    if (newAsset.notes) payload.notes = newAsset.notes;

    const res = await api.post('/assets', payload);
    if (res.success) {
      toast('Asset added', 'success');
      setShowAdd(false);
      setNewAsset({ name: '', category: 'equipment', serial_number: '', model: '', manufacturer: '', purchase_date: '', purchase_price: 0, current_value: 0, location: '', room_id: '', assigned_to: '', warranty_expiry: '', notes: '' });
      fetchAssets(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const updateAssetStatus = async (id: string, status: string) => {
    const res = await api.patch(`/assets/${id}`, { status });
    if (res.success) { toast('Status updated', 'success'); fetchAssets(); fetchSummary(); }
    else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  if (loading) return <div className="animate-fade-in space-y-6"><div className="skeleton h-16" /><div className="skeleton h-64" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Asset Register</h1>
        {canManage && (
          <button className={`btn ${showAdd ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add Asset'}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Assets</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.by_status.reduce((s, x) => s + x.count, 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Current Value</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{'\u00A3'}{(summary.total_value?.total ?? 0).toFixed(0)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">In Maintenance</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{summary.by_status.find(s => s.status === 'maintenance')?.count ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Warranty Expiring</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{summary.warranty_expiring_soon}</p>
          </div>
        </div>
      )}

      {/* Add Asset Form */}
      {showAdd && canManage && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-blue-50/50 p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Asset</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Asset Name</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.name} onChange={(e) => setNewAsset(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Category</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.category} onChange={(e) => setNewAsset(s => ({ ...s, category: e.target.value }))}>
                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Serial Number</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.serial_number} onChange={(e) => setNewAsset(s => ({ ...s, serial_number: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Model</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.model} onChange={(e) => setNewAsset(s => ({ ...s, model: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Manufacturer</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.manufacturer} onChange={(e) => setNewAsset(s => ({ ...s, manufacturer: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Purchase Price ({'\u00A3'})</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="number" step="0.01" value={newAsset.purchase_price || ''} onChange={(e) => setNewAsset(s => ({ ...s, purchase_price: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Purchase Date</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="date" value={newAsset.purchase_date} onChange={(e) => setNewAsset(s => ({ ...s, purchase_date: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Room</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.room_id} onChange={(e) => setNewAsset(s => ({ ...s, room_id: e.target.value }))}>
                <option value="">No room</option>
                {rooms.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Warranty Expiry</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="date" value={newAsset.warranty_expiry} onChange={(e) => setNewAsset(s => ({ ...s, warranty_expiry: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Location</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newAsset.location} onChange={(e) => setNewAsset(s => ({ ...s, location: e.target.value }))} />
            </div>
            <div className="col-span-2 flex items-end">
              <button className="btn btn-success" onClick={addAsset}>Add Asset</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Asset Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="p-6">
          {assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No assets found</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Asset</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Category</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Location</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Value</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  {canManage && <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => (
                  <tr key={asset.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-3.5">
                      <p className="font-semibold text-gray-900">{asset.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {[asset.manufacturer, asset.model, asset.serial_number ? `S/N: ${asset.serial_number}` : null].filter(Boolean).join(' \u00B7 ') || 'No details'}
                      </p>
                    </td>
                    <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryColors[asset.category]}`}>{asset.category}</span></td>
                    <td className="py-3.5">
                      {asset.room_name ? (
                        <span className="rounded-md px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: asset.room_color ?? '#6B7280' }}>{asset.room_name}</span>
                      ) : (
                        <span className="text-xs text-gray-400">{asset.location ?? 'Unassigned'}</span>
                      )}
                    </td>
                    <td className="py-3.5 font-medium text-gray-900">{asset.current_value != null ? `\u00A3${asset.current_value.toFixed(0)}` : '\u2014'}</td>
                    <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColors[asset.status]}`}>{asset.status}</span></td>
                    {canManage && (
                      <td className="py-3.5 text-right">
                        <div className="flex justify-end gap-1">
                          {asset.status === 'active' && (
                            <button className="btn btn-ghost py-0.5 text-[10px]" onClick={() => updateAssetStatus(asset.id, 'maintenance')}>Maintenance</button>
                          )}
                          {asset.status === 'maintenance' && (
                            <button className="btn btn-success py-0.5 text-[10px]" onClick={() => updateAssetStatus(asset.id, 'active')}>Restore</button>
                          )}
                          {['active', 'maintenance'].includes(asset.status) && (
                            <button className="btn btn-ghost py-0.5 text-[10px] text-red-600" onClick={() => updateAssetStatus(asset.id, 'retired')}>Retire</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
