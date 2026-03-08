import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

interface SummaryData {
  total: number;
  by_status: Array<{ status: string; count: number }>;
  by_platform: Array<{ platform: string; count: number }>;
  approval_rate: number | null;
  avg_ai_confidence: number | null;
}

export function AnalyticsPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SummaryData>('/analytics/summary')
      .then((res) => {
        if (res.success && res.data) setSummary(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="skeleton h-96" />;
  }

  if (!summary) {
    return <p className="text-gray-500">Failed to load analytics</p>;
  }

  const statusColors: Record<string, string> = {
    PENDING: '#f59e0b', NEEDS_REVIEW: '#f97316', APPROVED: '#3b82f6',
    PLATFORM_ACTIONED: '#6366f1', CONFIRMED: '#10b981', REJECTED: '#ef4444', CANCELLED: '#6b7280',
  };

  return (
    <div className="animate-fade-in">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-gray-900">Analytics</h1>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Total Bookings" value={String(summary.total)} accent="blue" />
        <MetricCard
          title="Approval Rate"
          value={summary.approval_rate != null ? `${(summary.approval_rate * 100).toFixed(0)}%` : '\u2014'}
          accent="emerald"
        />
        <MetricCard
          title="Avg AI Confidence"
          value={summary.avg_ai_confidence != null ? `${(summary.avg_ai_confidence * 100).toFixed(0)}%` : '\u2014'}
          accent="violet"
        />
        <MetricCard title="Platforms Active" value={String(summary.by_platform.length)} accent="amber" />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-gray-400">By Status</h3>
          <div className="space-y-3">
            {summary.by_status.map((item) => (
              <div key={item.status} className="flex items-center gap-3 text-sm">
                <span className="w-28 text-xs font-medium text-gray-600">{item.status.replace(/_/g, ' ')}</span>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(3, (item.count / summary.total) * 100)}%`, backgroundColor: statusColors[item.status] ?? '#6b7280' }}
                    />
                  </div>
                </div>
                <span className="w-8 text-right text-xs font-bold text-gray-700">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-gray-400">By Platform</h3>
          <div className="space-y-3">
            {summary.by_platform.map((item) => (
              <div key={item.platform} className="flex items-center gap-3 text-sm">
                <span className="w-28 text-xs font-medium capitalize text-gray-600">{item.platform}</span>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.max(3, (item.count / summary.total) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="w-8 text-right text-xs font-bold text-gray-700">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const accentMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
};

function MetricCard({ title, value, accent = 'blue' }: { title: string; value: string; accent?: string }) {
  const a = accentMap[accent] ?? accentMap.blue!;
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.bg}`}>
          <span className={`text-lg font-bold ${a.text}`}>#</span>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
