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

// Per-UOM normalization. The displayed price for "500ml at TT$7" becomes
// "TT$1.40 / 100ml" so the user can compare against a 750ml competitor SKU.
// Returns null when normalization isn't meaningful (no UOM, "each", or
// missing size). For weight-priced items (PriceSmart deli, produce-by-lb)
// the price IS already per-UOM — we surface the natural unit instead.
export function formatPerUnitPrice(args: {
  amountMinorUnits: number;
  unitSize: number | null;
  unitOfMeasure: string | null;
  currency: string;
  isSoldByWeight: boolean;
}): string | null {
  const { amountMinorUnits, unitSize, unitOfMeasure, currency, isSoldByWeight } = args;
  if (!unitOfMeasure || unitOfMeasure === 'each') return null;

  if (isSoldByWeight) {
    // Price is already per-UOM at the register. Just label it.
    return `${formatPrice(amountMinorUnits, currency)} / ${unitOfMeasure}`;
  }

  if (!unitSize || unitSize <= 0) return null;

  // Pick a sensible reference unit so the displayed number is human-readable:
  //   ml/g → per 100  (TT$1.40 / 100ml)
  //   L/kg → per 1    (TT$8.50 / L)
  //   oz   → per 1    (TT$0.50 / oz)
  //   lb   → per 1    (TT$30.00 / lb)
  const referenceUnit = unitOfMeasure === 'ml' || unitOfMeasure === 'g' ? 100 : 1;
  const perReference = (amountMinorUnits / unitSize) * referenceUnit;
  if (!Number.isFinite(perReference)) return null;

  const label = referenceUnit === 100 ? `100${unitOfMeasure}` : unitOfMeasure;
  return `${formatPrice(Math.round(perReference), currency)} / ${label}`;
}

// Multipack breakdown. "TT$110 case of 24" becomes "case of 24 — TT$4.58 each"
// so the user can compare against a single-unit SKU at another store. Returns
// null when units_per_pack is unset, 1, or invalid.
export function formatPackEach(args: {
  amountMinorUnits: number;
  unitsPerPack: number | null;
  currency: string;
}): string | null {
  const { amountMinorUnits, unitsPerPack, currency } = args;
  if (!unitsPerPack || unitsPerPack <= 1) return null;
  const perUnit = Math.round(amountMinorUnits / unitsPerPack);
  if (!Number.isFinite(perUnit)) return null;
  return `case of ${unitsPerPack} — ${formatPrice(perUnit, currency)} each`;
}
