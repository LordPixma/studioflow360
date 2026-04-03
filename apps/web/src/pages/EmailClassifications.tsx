import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';

type Category = 'booking' | 'update' | 'marketing' | 'informational' | 'unknown';

interface Classification {
  id: string;
  r2_key: string;
  platform: string | null;
  sender_domain: string;
  subject: string;
  category: Category;
  ai_confidence: number;
  message_id: string;
  received_at: string;
  reviewed: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Stats {
  category: string;
  count: number;
  unreviewed: number;
}

const DEFAULT_COLORS = { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' };
const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  booking: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  update: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  marketing: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  informational: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  unknown: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
};

const CATEGORIES: Category[] = ['booking', 'update', 'marketing', 'informational', 'unknown'];

export function EmailClassificationsPage() {
  const [items, setItems] = useState<Classification[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [reviewedFilter, setReviewedFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reclassifyId, setReclassifyId] = useState<string | null>(null);
  const [reclassifyCategory, setReclassifyCategory] = useState<Category>('unknown');
  const [reclassifyNotes, setReclassifyNotes] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    if (filter) params.set('category', filter);
    if (reviewedFilter) params.set('reviewed', reviewedFilter);

    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(`${API}/api/email-classifications?${params}`, { credentials: 'include' }),
        fetch(`${API}/api/email-classifications/stats`, { credentials: 'include' }),
      ]);
      const listData = await listRes.json();
      const statsData = await statsRes.json();
      if (listData.success) {
        setItems(listData.data);
        setTotalPages(listData.pagination.total_pages);
        setTotal(listData.pagination.total);
      }
      if (statsData.success) setStats(statsData.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, filter, reviewedFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function markReviewed(id: string) {
    await fetch(`${API}/api/email-classifications/${id}/review`, {
      method: 'PATCH',
      credentials: 'include',
    });
    fetchData();
  }

  async function submitReclassify() {
    if (!reclassifyId) return;
    await fetch(`${API}/api/email-classifications/${reclassifyId}/reclassify`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: reclassifyCategory, notes: reclassifyNotes || undefined }),
    });
    setReclassifyId(null);
    setReclassifyNotes('');
    fetchData();
  }

  const totalEmails = stats.reduce((s, r) => s + r.count, 0);
  const totalUnreviewed = stats.reduce((s, r) => s + r.unreviewed, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Email Classifications</h1>
        <p className="mt-1 text-sm text-gray-500">AI-classified emails from booking platforms and other sources</p>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total Emails</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalEmails}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Unreviewed</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{totalUnreviewed}</p>
        </div>
        {stats.map((s) => {
          const colors = CATEGORY_COLORS[s.category] ?? DEFAULT_COLORS;
          return (
            <div key={s.category} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                <p className="text-xs font-medium capitalize text-gray-500">{s.category}</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-gray-900">{s.count}</p>
              {s.unreviewed > 0 && (
                <p className="text-xs text-amber-600">{s.unreviewed} unreviewed</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select
          value={reviewedFilter}
          onChange={(e) => { setReviewedFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All status</option>
          <option value="0">Unreviewed</option>
          <option value="1">Reviewed</option>
        </select>
        <span className="text-sm text-gray-500">{total} result{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">No classified emails found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Subject</th>
                <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Sender</th>
                <th className="hidden sm:table-cell px-4 py-3 text-left font-medium text-gray-500">Platform</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
                <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Confidence</th>
                <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Received</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const colors = CATEGORY_COLORS[item.category] ?? DEFAULT_COLORS;
                const confidence = Math.round(item.ai_confidence * 100);
                return (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="max-w-[280px] truncate px-4 py-3 font-medium text-gray-900" title={item.subject}>
                      {item.subject}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-600">{item.sender_domain}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {item.platform ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium capitalize text-indigo-700">{item.platform}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors.bg} ${colors.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                        {item.category}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-200">
                          <div
                            className={`h-1.5 rounded-full ${confidence >= 70 ? 'bg-green-500' : confidence >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{confidence}%</span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Date(item.received_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      {item.reviewed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                          Reviewed
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {!item.reviewed && (
                          <button
                            onClick={() => markReviewed(item.id)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            Review
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setReclassifyId(item.id);
                            setReclassifyCategory(item.category);
                            setReclassifyNotes(item.notes ?? '');
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          Reclassify
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Reclassify modal */}
      {reclassifyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReclassifyId(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Reclassify Email</h3>
            <p className="mt-1 text-sm text-gray-500">Override the AI classification for this email</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={reclassifyCategory}
                  onChange={(e) => setReclassifyCategory(e.target.value as Category)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
                <textarea
                  value={reclassifyNotes}
                  onChange={(e) => setReclassifyNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Reason for reclassification..."
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setReclassifyId(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReclassify}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
