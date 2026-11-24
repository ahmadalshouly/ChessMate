import type { CampaignStatus } from '@chessmate/core';

import type { BadgeTone } from '@/ui';

/** Badge colour per push campaign status. */
export const STATUS_TONE: Record<CampaignStatus, BadgeTone> = {
  draft: 'outline',
  scheduled: 'warning',
  sending: 'live',
  sent: 'success',
  active: 'live',
  paused: 'neutral',
  cancelled: 'neutral',
  failed: 'danger',
};
