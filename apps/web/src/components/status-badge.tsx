'use client';

import { PROJECT_STATUS_META } from '@yulia/core/enums';
import { Badge } from '@/components/ui/primitives';

export function StatusBadge({ status }: { status: string }) {
  const meta = PROJECT_STATUS_META[status as keyof typeof PROJECT_STATUS_META];
  const tone =
    status === 'completed' ? 'green' : status === 'failed' ? 'red' : meta && meta.order > 0 ? 'blue' : 'neutral';
  return <Badge tone={tone}>{meta?.label ?? status}</Badge>;
}
