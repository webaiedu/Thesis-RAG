'use client';

import { useEffect, useState } from 'react';
import type { UsageStatus } from '@/lib/api';

function resetText(resetAt: number | null, now: number) {
  if (!resetAt) return 'Resets 1 hour after your next message';
  const mins = Math.max(1, Math.ceil((resetAt - now) / 60_000));
  return `Resets in ${mins} min`;
}

/** Hourly token usage under the chat box: a small bar and a percentage. */
export default function UsageMeter({ usage, onExpired }: { usage: UsageStatus | null; onExpired: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  // Keep "resets in" current, and refresh the numbers once the hour is over.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!usage?.resetAt) return;
    const ms = usage.resetAt - Date.now();
    const id = setTimeout(onExpired, Math.max(0, ms) + 500);
    return () => clearTimeout(id);
  }, [usage?.resetAt, onExpired]);

  if (!usage) return <div className="usage" aria-hidden="true" />;
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const level = pct >= 100 ? 'full' : pct >= 85 ? 'high' : pct >= 60 ? 'mid' : 'low';
  const detail =
    `${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} tokens used this hour · ` +
    resetText(usage.resetAt, now);

  return (
    <div className={`usage ${level}`} title={detail}>
      <span
        className="usage-bar"
        role="meter"
        aria-label="Hourly usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={detail}
      >
        <span className="usage-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="usage-text">
        {pct >= 100 ? `Limit reached · ${resetText(usage.resetAt, now).toLowerCase()}` : `${pct}% used`}
      </span>
    </div>
  );
}
