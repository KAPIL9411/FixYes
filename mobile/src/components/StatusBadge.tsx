import type { BookingStatus } from '../api/types';
import { STATUS_COPY } from '../lib/format';
import { statusTone } from '../lib/status';
import { Pill } from '../ui/core';

export function StatusBadge({
  status,
  size = 'default',
}: {
  status: BookingStatus;
  size?: 'default' | 'compact';
}) {
  return (
    <Pill
      label={STATUS_COPY[status].toUpperCase()}
      tone={statusTone(status)}
      style={size === 'compact' ? { paddingVertical: 3, paddingHorizontal: 7 } : undefined}
    />
  );
}
