import type { Night } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Per job, by lastStatus.
export function nightCounts(night: Night): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of night.rows) counts[row.lastStatus] += 1;
  return counts;
}
