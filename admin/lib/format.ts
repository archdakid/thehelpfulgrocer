export function formatMoney(minorUnits: number, currency: string): string {
  const major = minorUnits / 100;
  const symbol = currency === 'TTD' ? 'TT$' : `${currency} `;
  return `${symbol}${major.toFixed(2)}`;
}

export function reasonLabel(reason: string): string {
  switch (reason) {
    case 'unmatched':
      return 'Unmatched';
    case 'low_confidence':
      return 'Low confidence';
    case 'auto_created_product':
      return 'Auto-created';
    default:
      return reason;
  }
}

// Tailwind classes — kept here so the queue list and detail page agree on
// reason coloring without duplicating literal strings.
export function reasonTone(reason: string): string {
  switch (reason) {
    case 'unmatched':
      return 'bg-danger/10 text-danger';
    case 'low_confidence':
      return 'bg-warn/10 text-warn';
    case 'auto_created_product':
      return 'bg-accent/10 text-accent';
    default:
      return 'bg-border text-muted';
  }
}
