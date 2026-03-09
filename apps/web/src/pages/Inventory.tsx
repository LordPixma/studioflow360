import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';

const API = '/api/inventory';

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General', cables: 'Cables', batteries: 'Batteries', tape: 'Tape',
  lighting: 'Lighting', audio: 'Audio', cleaning: 'Cleaning', stationery: 'Stationery',
  refreshments: 'Refreshments', safety: 'Safety', other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-100 text-gray-700', cables: 'bg-blue-100 text-blue-700',
  batteries: 'bg-yellow-100 text-yellow-700', tape: 'bg-orange-100 text-orange-700',
  lighting: 'bg-amber-100 text-amber-700', audio: 'bg-purple-100 text-purple-700',
  cleaning: 'bg-cyan-100 text-cyan-700', stationery: 'bg-green-100 text-green-700',
  refreshments: 'bg-pink-100 text-pink-700', safety: 'bg-red-100 text-red-700',
  other: 'bg-slate-100 text-slate-700',
};

const UNIT_LABELS: Record<string, string> = {
  pcs: 'pcs', boxes: 'boxes', rolls: 'rolls', packs: 'packs',
  litres: 'L', kg: 'kg', metres: 'm', pairs: 'pairs', sets: 'sets',
};

const TX_LABELS: Record<string, string> = {
  restock: 'Restock', usage: 'Usage', adjustment: 'Adjustment', return: 'Return', write_off: 'Write Off',
};
const TX_COLORS: Record<string, string> = {
  restock: 'text-green-600', usage: 'text-red-600', adjustment: 'text-blue-600', return: 'text-green-600', write_off: 'text-red-600',
};

interface InventoryItem {
  id: string; sku: string | null; name: string; description: string | null;
  category: string; unit: string; quantity_on_hand: number; minimum_stock: number;
  reorder_quantity: number; unit_cost: number; currency: string;
  supplier: string | null; supplier_url: string | null;
  location: string | null; room_id: string | null; room_name: string | null;
  notes: string | null; is_active: number; last_restocked_at: string | null;
  created_at: string; updated_at: string;
  transactions?: Transaction[];
}

interface Transaction {
  id: string; item_id: string; transaction_type: string;
  quantity: number; previous_quantity: number; new_quantity: number;
  reference: string | null; notes: string | null;
  created_by_name: string; created_at: string;
}

interface Summary {
  total_items: number; low_stock_count: number; out_of_stock_count: number; total_value: number;
}

interface Room { id: string; name: string }

export function InventoryPage() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);

  const canManage = staff?.permissions?.includes('inventory.manage');

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCategory) params.set('category', filterCategory);
    if (filterLowStock) params.set('low_stock', '1');
    if (search) params.set('search', search);
    params.set('per_page', '200');

    const res = await fetch(`${API}?${params}`);
    const json = await res.json() as { success: boolean; data: InventoryItem[] };
    if (json.success) setItems(json.data);
  }, [filterCategory, filterLowStock, search]);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`${API}/summary`);
    const json = await res.json() as { success: boolean; data: Summary };
    if (json.success) setSummary(json.data);
  }, []);

  useEffect(() => {
    Promise.all([fetchItems(), fetchSummary()]).finally(() => setLoading(false));
  }, [fetchItems, fetchSummary]);

  useEffect(() => {
    fetch('/api/rooms').then(r => r.json()).then((j: { data: Room[] }) => setRooms(j.data || []));
  }, []);

  const openDetail = async (item: InventoryItem) => {
    const res = await fetch(`${API}/${item.id}`);
    const json = await res.json() as { success: boolean; data: InventoryItem };
    if (json.success) setSelectedItem(json.data);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Deactivate this item?')) return;
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Item deactivated', 'success');
      setSelectedItem(null);
      fetchItems(); fetchSummary();
    }
  };

  const isLowStock = (item: InventoryItem) => item.minimum_stock > 0 && item.quantity_on_hand <= item.minimum_stock;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory & Supplies</h1>
          <p className="text-sm text-gray-500">Track studio consumables, supplies, and stock levels</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            + Add Item
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Items</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.total_items}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Low Stock</p>
            <p className={`mt-1 text-2xl font-bold ${summary.low_stock_count > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{summary.low_stock_count}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Out of Stock</p>
            <p className={`mt-1 text-2xl font-bold ${summary.out_of_stock_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>{summary.out_of_stock_count}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Value</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">&pound;{(summary.total_value ?? 0).toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={filterLowStock} onChange={e => setFilterLowStock(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          Low stock only
        </label>
      </div>

      {/* Item Table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Item</th>
              <th className="px-4 py-3 font-medium text-gray-500">Category</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Stock</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Min</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Cost</th>
              <th className="px-4 py-3 font-medium text-gray-500">Location</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">No items found</td></tr>
            ) : items.map(item => (
              <tr key={item.id} onClick={() => openDetail(item)} className="cursor-pointer transition-colors hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  {item.sku && <p className="text-xs text-gray-400">{item.sku}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[item.category]}`}>{CATEGORY_LABELS[item.category]}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-medium ${item.quantity_on_hand === 0 ? 'text-red-600' : isLowStock(item) ? 'text-orange-600' : 'text-gray-900'}`}>
                    {item.quantity_on_hand}
                  </span>
                  <span className="ml-1 text-xs text-gray-400">{UNIT_LABELS[item.unit]}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{item.minimum_stock}</td>
                <td className="px-4 py-3 text-right text-gray-700">&pound;{item.unit_cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500">{item.room_name || item.location || '—'}</td>
                <td className="px-4 py-3">
                  {item.quantity_on_hand === 0 ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Out of Stock</span>
                  ) : isLowStock(item) ? (
                    <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">Low Stock</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">In Stock</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Item Modal */}
      {showForm && <CreateItemModal rooms={rooms} onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); fetchItems(); fetchSummary(); toast('Item added', 'success'); }} />}

      {/* Item Detail Slide-over */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => { setSelectedItem(null); setShowTxForm(false); }}>
          <div className="w-full max-w-lg overflow-auto bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  {selectedItem.sku && <p className="text-xs font-mono text-gray-400">{selectedItem.sku}</p>}
                  <h2 className="text-lg font-bold text-gray-900">{selectedItem.name}</h2>
                </div>
                <button onClick={() => { setSelectedItem(null); setShowTxForm(false); }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORY_COLORS[selectedItem.category]}`}>{CATEGORY_LABELS[selectedItem.category]}</span>
                {selectedItem.quantity_on_hand === 0 ? (
                  <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">Out of Stock</span>
                ) : isLowStock(selectedItem) ? (
                  <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700">Low Stock</span>
                ) : (
                  <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">In Stock</span>
                )}
              </div>
            </div>

            <div className="space-y-6 px-6 py-4">
              {/* Stock level */}
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Current Stock</p>
                    <p className={`text-3xl font-bold ${selectedItem.quantity_on_hand === 0 ? 'text-red-600' : isLowStock(selectedItem) ? 'text-orange-600' : 'text-gray-900'}`}>
                      {selectedItem.quantity_on_hand} <span className="text-sm font-normal text-gray-500">{UNIT_LABELS[selectedItem.unit]}</span>
                    </p>
                  </div>
                  {canManage && (
                    <button onClick={() => setShowTxForm(!showTxForm)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                      {showTxForm ? 'Cancel' : 'Adjust Stock'}
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-gray-500">Min Stock</p><p className="font-medium">{selectedItem.minimum_stock}</p></div>
                  <div><p className="text-xs text-gray-500">Reorder Qty</p><p className="font-medium">{selectedItem.reorder_quantity}</p></div>
                  <div><p className="text-xs text-gray-500">Unit Cost</p><p className="font-medium">&pound;{selectedItem.unit_cost.toFixed(2)}</p></div>
                </div>
              </div>

              {/* Stock adjustment form */}
              {showTxForm && (
                <StockAdjustmentForm itemId={selectedItem.id} onDone={() => { setShowTxForm(false); openDetail(selectedItem); fetchItems(); fetchSummary(); }} />
              )}

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedItem.supplier && <div><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{selectedItem.supplier}</p></div>}
                {selectedItem.room_name && <div><p className="text-xs text-gray-500">Room</p><p className="font-medium">{selectedItem.room_name}</p></div>}
                {selectedItem.location && <div><p className="text-xs text-gray-500">Location</p><p className="font-medium">{selectedItem.location}</p></div>}
                {selectedItem.last_restocked_at && <div><p className="text-xs text-gray-500">Last Restocked</p><p className="font-medium">{new Date(selectedItem.last_restocked_at).toLocaleDateString()}</p></div>}
              </div>

              {selectedItem.description && (
                <div><p className="text-xs font-medium text-gray-500 mb-1">Description</p><p className="text-sm text-gray-700">{selectedItem.description}</p></div>
              )}
              {selectedItem.notes && (
                <div><p className="text-xs font-medium text-gray-500 mb-1">Notes</p><p className="text-sm text-gray-700">{selectedItem.notes}</p></div>
              )}

              {/* Transaction History */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Stock History</p>
                {selectedItem.transactions && selectedItem.transactions.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {selectedItem.transactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
                        <div>
                          <span className={`font-medium ${TX_COLORS[tx.transaction_type]}`}>{TX_LABELS[tx.transaction_type]}</span>
                          {tx.reference && <span className="ml-2 text-xs text-gray-400">{tx.reference}</span>}
                          {tx.notes && <p className="text-xs text-gray-500 mt-0.5">{tx.notes}</p>}
                          <p className="text-[10px] text-gray-400">{tx.created_by_name} &middot; {new Date(tx.created_at).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-medium ${tx.new_quantity > tx.previous_quantity ? 'text-green-600' : tx.new_quantity < tx.previous_quantity ? 'text-red-600' : 'text-gray-600'}`}>
                            {tx.new_quantity > tx.previous_quantity ? '+' : ''}{tx.new_quantity - tx.previous_quantity}
                          </p>
                          <p className="text-[10px] text-gray-400">{tx.previous_quantity} &rarr; {tx.new_quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-400">No transactions yet</p>}
              </div>

              {/* Delete */}
              {canManage && (
                <button onClick={() => deleteItem(selectedItem.id)} className="text-xs text-red-500 hover:text-red-700">Deactivate item</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockAdjustmentForm({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [txType, setTxType] = useState('restock');
  const [qty, setQty] = useState(1);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const res = await fetch(`${API}/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, transaction_type: txType, quantity: qty, reference: reference || undefined, notes: notes || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      toast('Stock updated', 'success');
      onDone();
    } else {
      const err = await res.json() as { error?: { message: string } };
      toast(err.error?.message || 'Failed', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select value={txType} onChange={e => setTxType(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="restock">Restock (+)</option>
            <option value="usage">Usage (-)</option>
            <option value="return">Return (+)</option>
            <option value="write_off">Write Off (-)</option>
            <option value="adjustment">Adjustment (+/-)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
          <input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Reference (optional)</label>
        <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. PO-123" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <button onClick={handleSubmit} disabled={saving || qty <= 0} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving...' : 'Record Transaction'}
      </button>
    </div>
  );
}

function CreateItemModal({ rooms, onClose, onCreated }: {
  rooms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: '', sku: '', description: '', category: 'general', unit: 'pcs',
    quantity_on_hand: 0, minimum_stock: 0, reorder_quantity: 0, unit_cost: 0,
    supplier: '', location: '', room_id: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = { ...form };
    if (!payload.sku) delete payload.sku;
    if (!payload.description) delete payload.description;
    if (!payload.supplier) delete payload.supplier;
    if (!payload.location) delete payload.location;
    if (!payload.room_id) delete payload.room_id;
    if (!payload.notes) delete payload.notes;

    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Add Inventory Item</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
              <input type="text" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Cost (&pound;)</label>
              <input type="number" min={0} step={0.01} value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Initial Stock</label>
              <input type="number" min={0} value={form.quantity_on_hand} onChange={e => setForm({ ...form, quantity_on_hand: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Stock Level</label>
              <input type="number" min={0} value={form.minimum_stock} onChange={e => setForm({ ...form, minimum_stock: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Qty</label>
              <input type="number" min={0} value={form.reorder_quantity} onChange={e => setForm({ ...form, reorder_quantity: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
              <input type="text" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Storage Room A"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Room</label>
              <select value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">None</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
