import { config } from '@/constants/config';

export function formatPrice(amountMinorUnits: number, currency: string = config.defaultCurrency): string {
  const major = amountMinorUnits / 100;
  return new Intl.NumberFormat('en-TT', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  const diff = now.getTime() - then;

  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes}m ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / DAY);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function isStalePrice(observedAtIso: string, now: Date = new Date()): boolean {
  const observedAt = new Date(observedAtIso).getTime();
  return now.getTime() - observedAt > config.staleThresholdDays * DAY;
}
