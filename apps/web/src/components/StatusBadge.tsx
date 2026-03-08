import type { BookingStatus } from '@studioflow360/shared';

const statusConfig: Record<BookingStatus, { bg: string; text: string; dot: string; label: string }> = {
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', label: 'Pending' },
  NEEDS_REVIEW: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400', label: 'Needs Review' },
  APPROVED: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400', label: 'Approved' },
  PLATFORM_ACTIONED: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400', label: 'Actioned' },
  CONFIRMED: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Confirmed' },
  REJECTED: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400', label: 'Rejected' },
  CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', label: 'Cancelled' },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const c = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
