import { config } from '@/constants/config';

export function formatPrice(amountMinorUnits: number, currency: string = config.defaultCurrency): string {
  const major = amountMinorUnits / 100;
  return new Intl.NumberFormat('en-TT', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}
