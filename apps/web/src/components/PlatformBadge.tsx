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
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {platformLabels[platform]}
    </span>
  );
}
