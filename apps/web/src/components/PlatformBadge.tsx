import { PLATFORM_COLORS, type Platform } from '@studioflow360/shared';

const platformLabels: Record<Platform, string> = {
  giggster: 'Giggster',
  peerspace: 'Peerspace',
  scouty: 'Scouty',
  tagvenue: 'TagVenue',
  direct: 'Direct',
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  const color = PLATFORM_COLORS[platform];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {platformLabels[platform]}
    </span>
  );
}
