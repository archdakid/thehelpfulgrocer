/* global React, TEAL, AMBER, IconMapPin, IconCheck */

// ── Price comparison sheet (modal) ──
const STORES_CMP = [
  { id: 'pricesmart', name: 'PriceSmart', distance: '4.2 km', total: 168.40, items: 9, missing: 1, best: true },
  { id: 'massy', name: 'Massy', distance: '1.1 km', total: 182.60, items: 10, missing: 0, current: true },
  { id: 'tru', name: 'Tru Valu', distance: '2.3 km', total: 186.95, items: 10, missing: 0 },
  { id: 'jta', name: 'JTA', distance: '3.0 km', total: 191.20, items: 9, missing: 1 },
  { id: 'xtra', name: 'Xtra Foods', distance: '5.8 km', total: 198.50, items: 8, missing: 2 },
];

function CompareSheetScreen() {
  const sorted = [...STORES_CMP].sort((a, b) => a.total - b.total);
  const min = sorted[0].total;
  const max = sorted[sorted.length - 1].total;
  const range = max - min;

  return (
    <div className="ss-root" style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {/* dimmed list behind */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'var(--bg-canvas)',
        backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.18))',
      }}>
        <div style={{ paddingTop: 54, padding: '54px 16px 0', opacity: 0.35, pointerEvents: 'none' }}>
          <div className="t-h1" style={{ color: 'var(--text-primary)' }}>Weekly groceries</div>
          <div style={{ marginTop: 14, height: 200, borderRadius: 16, background: 'var(--bg-surface)' }}/>
        </div>
      </div>

      {/* sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'var(--bg-surface)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
        maxHeight: '88%', display: 'flex', flexDirection: 'column',
      }}>
        {/* grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 40, height: 5, borderRadius: 9999, background: 'var(--border-strong)', opacity: 0.5 }}/>
        </div>

        {/* header */}
        <div style={{ padding: '4px 20px 12px' }}>
          <div className="t-h2">Compare stores</div>
          <div className="t-body text-secondary" style={{ marginTop: 2 }}>
            10 items · Based on your last 30 days of receipts
          </div>
        </div>

        {/* savings callout */}
        <div style={{
          margin: '0 16px 12px', padding: '12px 14px',
          borderRadius: 14, background: 'rgba(239,159,39,0.12)',
          border: '0.5px solid rgba(239,159,39,0.35)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9999,
            background: AMBER, color: '#fff', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700,
          }}>$</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#8A5A1E' }}>
              Save TT$14.20 at PriceSmart
            </div>
            <div className="t-caption text-secondary" style={{ marginTop: 1 }}>
              4.2 km away · 1 item not stocked
            </div>
          </div>
        </div>

        {/* Bar list */}
        <div className="ss-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
          {sorted.map((s, i) => {
            const pct = range > 0 ? ((s.total - min) / range) * 100 : 0;
            const barW = 100 - pct * 0.85; // best is full, worst ~15%
            const isBest = s.best;
            const savings = s.total - min;
            return (
              <div key={s.id} style={{
                padding: '14px 0',
                borderBottom: i === sorted.length - 1 ? 'none' : '0.5px solid var(--border-default)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{s.name}</span>
                    {isBest && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                        color: '#fff', background: AMBER,
                        padding: '2px 6px', borderRadius: 9999, textTransform: 'uppercase',
                      }}>Best</span>
                    )}
                    {s.current && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
                        color: TEAL, background: 'rgba(15,110,86,0.10)',
                        padding: '2px 6px', borderRadius: 9999, textTransform: 'uppercase',
                      }}>You</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
                    {savings > 0 && (
                      <span className="t-caption text-tertiary">+${savings.toFixed(2)}</span>
                    )}
                    <span className="t-mono-lg" style={{
                      color: isBest ? AMBER : 'var(--text-primary)',
                    }}>${s.total.toFixed(2)}</span>
                  </div>
                </div>
                {/* bar */}
                <div style={{
                  height: 8, borderRadius: 9999,
                  background: 'var(--bg-muted)', overflow: 'hidden',
                  marginBottom: 6,
                }}>
                  <div style={{
                    width: `${barW}%`, height: '100%',
                    background: isBest ? AMBER : (s.current ? TEAL : 'var(--text-tertiary)'),
                    opacity: isBest || s.current ? 1 : 0.55,
                    borderRadius: 9999,
                  }}/>
                </div>
                <div style={{
                  display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <IconMapPin size={12} stroke="var(--text-tertiary)" sw={2}/> {s.distance}
                  </span>
                  <span>{s.items}/10 in stock</span>
                  {s.missing > 0 && (
                    <span style={{ color: AMBER, fontWeight: 600 }}>
                      {s.missing} missing
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* sticky CTA */}
        <div style={{
          flexShrink: 0, padding: '12px 16px 24px',
          borderTop: '0.5px solid var(--border-default)',
          background: 'var(--bg-surface)',
          display: 'flex', gap: 10,
        }}>
          <button style={{
            flex: 1, height: 50, borderRadius: 14,
            background: 'var(--bg-muted)', color: 'var(--text-primary)',
            border: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}>Stay at Massy</button>
          <button style={{
            flex: 1.4, height: 50, borderRadius: 14,
            background: TEAL, color: '#fff',
            border: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}>Switch to PriceSmart</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CompareSheetScreen });
