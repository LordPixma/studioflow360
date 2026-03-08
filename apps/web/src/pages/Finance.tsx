import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { usePermission } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';
import type { BudgetRow, PurchaseRow } from '@studioflow360/shared';

type Tab = 'overview' | 'budgets' | 'purchases';

interface FinanceSummary {
  active_budgets: (BudgetRow & { actual_spent: number })[];
  spending_by_category: { category: string; total: number; count: number }[];
  purchases_by_status: { status: string; count: number; total: number }[];
  recent_spending: { last_30_days: number; last_7_days: number } | null;
}

type PurchaseWithJoins = PurchaseRow & { creator_name: string | null; approver_name: string | null; budget_name: string | null };

const CATEGORIES = ['operations', 'maintenance', 'marketing', 'equipment', 'supplies', 'other'] as const;
const PERIODS = ['monthly', 'quarterly', 'annually'] as const;
const categoryColors: Record<string, string> = {
  operations: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700',
  marketing: 'bg-purple-100 text-purple-700',
  equipment: 'bg-emerald-100 text-emerald-700',
  supplies: 'bg-rose-100 text-rose-700',
  other: 'bg-gray-100 text-gray-600',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-600',
};

export function FinancePage() {
  const { toast } = useToast();
  const canManage = usePermission('finance.manage');
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [budgets, setBudgets] = useState<(BudgetRow & { actual_spent: number })[]>([]);
  const [purchases, setPurchases] = useState<PurchaseWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [newBudget, setNewBudget] = useState({ name: '', category: 'operations' as string, amount: 0, period: 'monthly' as string, start_date: '', end_date: '', notes: '' });
  const [newPurchase, setNewPurchase] = useState({ description: '', vendor: '', amount: 0, category: 'supplies' as string, purchase_date: new Date().toISOString().split('T')[0]!, budget_id: '', notes: '' });

  const fetchSummary = async () => {
    const res = await api.get<FinanceSummary>('/finance/summary');
    if (res.success && res.data) setSummary(res.data);
    setLoading(false);
  };

  const fetchBudgets = async () => {
    const res = await api.get<(BudgetRow & { actual_spent: number })[]>('/finance/budgets');
    if (res.success && res.data) setBudgets(res.data);
  };

  const fetchPurchases = async () => {
    const res = await api.get<PurchaseWithJoins[]>('/finance/purchases');
    if (res.success && res.data) setPurchases(res.data as PurchaseWithJoins[]);
  };

  useEffect(() => { fetchSummary(); fetchBudgets(); fetchPurchases(); }, []);

  const addBudget = async () => {
    if (!newBudget.name.trim() || !newBudget.amount) return;
    const res = await api.post('/finance/budgets', { ...newBudget, notes: newBudget.notes || undefined });
    if (res.success) {
      toast('Budget created', 'success');
      setShowAddBudget(false);
      setNewBudget({ name: '', category: 'operations', amount: 0, period: 'monthly', start_date: '', end_date: '', notes: '' });
      fetchBudgets(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const addPurchase = async () => {
    if (!newPurchase.description.trim() || !newPurchase.amount) return;
    const payload: Record<string, unknown> = { ...newPurchase, notes: newPurchase.notes || undefined };
    if (!newPurchase.budget_id) delete payload.budget_id;
    if (!newPurchase.vendor) delete payload.vendor;
    const res = await api.post('/finance/purchases', payload);
    if (res.success) {
      toast('Purchase recorded', 'success');
      setShowAddPurchase(false);
      setNewPurchase({ description: '', vendor: '', amount: 0, category: 'supplies', purchase_date: new Date().toISOString().split('T')[0]!, budget_id: '', notes: '' });
      fetchPurchases(); fetchBudgets(); fetchSummary();
    } else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  const updatePurchaseStatus = async (id: string, status: string) => {
    const res = await api.patch(`/finance/purchases/${id}`, { status });
    if (res.success) { toast('Status updated', 'success'); fetchPurchases(); fetchBudgets(); fetchSummary(); }
    else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  if (loading) return <div className="animate-fade-in space-y-6"><div className="skeleton h-16" /><div className="skeleton h-64" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Finance</h1>
        {canManage && (
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => { setShowAddBudget(!showAddBudget); setShowAddPurchase(false); }}>
              {showAddBudget ? 'Cancel' : '+ Budget'}
            </button>
            <button className="btn btn-primary" onClick={() => { setShowAddPurchase(!showAddPurchase); setShowAddBudget(false); }}>
              {showAddPurchase ? 'Cancel' : '+ Purchase'}
            </button>
          </div>
        )}
      </div>

      {/* Add Budget Form */}
      {showAddBudget && canManage && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-blue-50/50 p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Budget</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Name</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newBudget.name} onChange={(e) => setNewBudget(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Category</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newBudget.category} onChange={(e) => setNewBudget(s => ({ ...s, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Amount ({'\u00A3'})</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="number" step="0.01" value={newBudget.amount || ''} onChange={(e) => setNewBudget(s => ({ ...s, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Period</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newBudget.period} onChange={(e) => setNewBudget(s => ({ ...s, period: e.target.value }))}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Start Date</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="date" value={newBudget.start_date} onChange={(e) => setNewBudget(s => ({ ...s, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">End Date</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="date" value={newBudget.end_date} onChange={(e) => setNewBudget(s => ({ ...s, end_date: e.target.value }))} />
            </div>
            <div className="col-span-2 flex items-end"><button className="btn btn-success" onClick={addBudget}>Create Budget</button></div>
          </div>
        </div>
      )}

      {/* Add Purchase Form */}
      {showAddPurchase && canManage && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-emerald-50/50 p-6 shadow-sm">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Purchase / Expense</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Description</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newPurchase.description} onChange={(e) => setNewPurchase(s => ({ ...s, description: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Amount ({'\u00A3'})</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="number" step="0.01" value={newPurchase.amount || ''} onChange={(e) => setNewPurchase(s => ({ ...s, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Category</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newPurchase.category} onChange={(e) => setNewPurchase(s => ({ ...s, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Vendor</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newPurchase.vendor} onChange={(e) => setNewPurchase(s => ({ ...s, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Date</label>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" type="date" value={newPurchase.purchase_date} onChange={(e) => setNewPurchase(s => ({ ...s, purchase_date: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Budget (optional)</label>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm" value={newPurchase.budget_id} onChange={(e) => setNewPurchase(s => ({ ...s, budget_id: e.target.value }))}>
                <option value="">No budget</option>
                {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex items-end"><button className="btn btn-success" onClick={addPurchase}>Record Purchase</button></div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(['overview', 'budgets', 'purchases'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'overview' ? 'Overview' : t === 'budgets' ? 'Budgets' : 'Purchases'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && summary && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Last 7 Days</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{'\u00A3'}{(summary.recent_spending?.last_7_days ?? 0).toFixed(0)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Last 30 Days</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{'\u00A3'}{(summary.recent_spending?.last_30_days ?? 0).toFixed(0)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Active Budgets</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{summary.active_budgets.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pending Approvals</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">
                {summary.purchases_by_status.find(s => s.status === 'pending')?.count ?? 0}
              </p>
            </div>
          </div>

          {/* Spending by Category */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Spending by Category</h3>
            {summary.spending_by_category.length === 0 ? (
              <p className="text-sm text-gray-400">No spending recorded yet</p>
            ) : (
              <div className="space-y-3">
                {summary.spending_by_category.map(cat => {
                  const maxTotal = Math.max(...summary.spending_by_category.map(c => c.total));
                  return (
                    <div key={cat.category}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryColors[cat.category] ?? 'bg-gray-100 text-gray-600'}`}>{cat.category}</span>
                        <span className="font-semibold text-gray-700">{'\u00A3'}{cat.total.toFixed(0)} ({cat.count} items)</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(cat.total / maxTotal) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Budget Utilization */}
          {summary.active_budgets.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Budget Utilization</h3>
              <div className="space-y-4">
                {summary.active_budgets.map(budget => {
                  const pct = budget.amount > 0 ? (budget.actual_spent / budget.amount) * 100 : 0;
                  const isOver = pct > 100;
                  return (
                    <div key={budget.id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700">{budget.name}</span>
                        <span className={`font-semibold ${isOver ? 'text-red-600' : 'text-gray-600'}`}>
                          {'\u00A3'}{budget.actual_spent.toFixed(0)} / {'\u00A3'}{budget.amount.toFixed(0)} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Budgets Tab */}
      {tab === 'budgets' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-6">
            {budgets.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No budgets yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Name</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Category</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Budget</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Spent</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Remaining</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Period</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map(b => {
                    const remaining = b.amount - b.actual_spent;
                    return (
                      <tr key={b.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                        <td className="py-3.5 font-semibold text-gray-900">{b.name}</td>
                        <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryColors[b.category]}`}>{b.category}</span></td>
                        <td className="py-3.5 font-medium text-gray-900">{'\u00A3'}{b.amount.toFixed(0)}</td>
                        <td className="py-3.5 font-medium text-gray-700">{'\u00A3'}{b.actual_spent.toFixed(0)}</td>
                        <td className={`py-3.5 font-semibold ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{'\u00A3'}{remaining.toFixed(0)}</td>
                        <td className="py-3.5 text-gray-500">{b.period} ({b.start_date} {'\u2013'} {b.end_date})</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Purchases Tab */}
      {tab === 'purchases' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="p-6">
            {purchases.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No purchases recorded yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Description</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Amount</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Category</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                    {canManage && <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                      <td className="py-3.5">
                        <p className="font-semibold text-gray-900">{p.description}</p>
                        {p.vendor && <p className="text-[11px] text-gray-400">{p.vendor}{p.budget_name ? ` \u00B7 ${p.budget_name}` : ''}</p>}
                      </td>
                      <td className="py-3.5 font-semibold text-gray-900">{'\u00A3'}{p.amount.toFixed(2)}</td>
                      <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryColors[p.category]}`}>{p.category}</span></td>
                      <td className="py-3.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColors[p.status]}`}>{p.status}</span></td>
                      <td className="py-3.5 text-gray-500">{p.purchase_date}</td>
                      {canManage && (
                        <td className="py-3.5 text-right">
                          <div className="flex justify-end gap-1">
                            {p.status === 'pending' && (
                              <>
                                <button className="btn btn-success py-0.5 text-[10px]" onClick={() => updatePurchaseStatus(p.id, 'approved')}>Approve</button>
                                <button className="btn btn-ghost py-0.5 text-[10px] text-red-600" onClick={() => updatePurchaseStatus(p.id, 'rejected')}>Reject</button>
                              </>
                            )}
                            {p.status === 'approved' && (
                              <button className="btn btn-primary py-0.5 text-[10px]" onClick={() => updatePurchaseStatus(p.id, 'paid')}>Mark Paid</button>
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
      )}
    </div>
  );
}
