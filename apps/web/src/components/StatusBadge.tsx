import type { BookingStatus } from '@studioflow360/shared';

const statusStyles: Record<BookingStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PLATFORM_ACTIONED: 'bg-indigo-100 text-indigo-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  NEEDS_REVIEW: 'Needs Review',
  APPROVED: 'Approved',
  PLATFORM_ACTIONED: 'Platform Actioned',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
