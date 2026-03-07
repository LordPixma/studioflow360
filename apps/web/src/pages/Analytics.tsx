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
    return <div className="h-96 animate-pulse rounded-lg bg-gray-200" />;
  }

  if (!summary) {
    return <p className="text-gray-500">Failed to load analytics</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Analytics Dashboard</h1>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Total Bookings" value={String(summary.total)} />
        <MetricCard
          title="Approval Rate"
          value={summary.approval_rate != null ? `${(summary.approval_rate * 100).toFixed(0)}%` : '—'}
        />
        <MetricCard
          title="Avg AI Confidence"
          value={
            summary.avg_ai_confidence != null
              ? `${(summary.avg_ai_confidence * 100).toFixed(0)}%`
              : '—'
          }
        />
        <MetricCard
          title="Platforms Active"
          value={String(summary.by_platform.length)}
        />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-medium text-gray-900">By Status</h3>
          <div className="space-y-2">
            {summary.by_status.map((item) => (
              <div key={item.status} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{item.status}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(8, (item.count / summary.total) * 200)}px` }} />
                  <span className="font-medium">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-medium text-gray-900">By Platform</h3>
          <div className="space-y-2">
            {summary.by_platform.map((item) => (
              <div key={item.platform} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 capitalize">{item.platform}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-purple-500" style={{ width: `${Math.max(8, (item.count / summary.total) * 200)}px` }} />
                  <span className="font-medium">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
