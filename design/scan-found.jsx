/* global React, TEAL, AMBER, IconCheck, IconScan, IconPlus, IconMore, CAT_COLORS, CatGlyph */

// ── Scan / found product confirmation screen ──
function ScanFoundScreen() {
  const [qty, setQty] = React.useState(2);

  return (
    <div className="ss-root" style={{
      position: 'relative', height: '100%',
      background: '#0A0A0B', overflow: 'hidden',
    }}>
      {/* fake camera viewfinder */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, #1a2426 0%, #0a0d0e 70%, #000 100%)',
      }}/>
      {/* faint product-shape blur */}
      <div style={{
        position: 'absolute', left: '50%', top: '38%',
        width: 240, height: 280, transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse, rgba(255,255,255,0.08), transparent 70%)',
        filter: 'blur(20px)',
      }}/>

      {/* top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 54, padding: '54px 16px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 2,
      }}>
        <button style={navBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div style={{
          fontSize: 14, fontWeight: 600, color: '#fff',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
          padding: '6px 12px', borderRadius: 9999,
        }}>Scan barcode</div>
        <button style={navBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </button>
      </div>

      {/* viewfinder corners */}
      <div style={{
        position: 'absolute', left: '50%', top: '32%',
        width: 240, height: 160, transform: 'translate(-50%, -50%)',
      }}>
        {[
          { top: 0, left: 0, br: 0 },
          { top: 0, right: 0, bl: 0 },
          { bottom: 0, left: 0, tr: 0 },
          { bottom: 0, right: 0, tl: 0 },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute', width: 28, height: 28,
            ...p,
            borderTop: p.top === 0 ? '3px solid #5FE5C0' : 'none',
            borderBottom: p.bottom === 0 ? '3px solid #5FE5C0' : 'none',
            borderLeft: p.left === 0 ? '3px solid #5FE5C0' : 'none',
            borderRight: p.right === 0 ? '3px solid #5FE5C0' : 'none',
            borderTopLeftRadius: p.top === 0 && p.left === 0 ? 12 : 0,
            borderTopRightRadius: p.top === 0 && p.right === 0 ? 12 : 0,
            borderBottomLeftRadius: p.bottom === 0 && p.left === 0 ? 12 : 0,
            borderBottomRightRadius: p.bottom === 0 && p.right === 0 ? 12 : 0,
          }}/>
        ))}
        {/* checkmark pulse */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 72, height: 72, borderRadius: 9999,
          background: 'rgba(15,110,86,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 12px rgba(15,110,86,0.18), 0 0 0 28px rgba(15,110,86,0.08)',
        }}>
          <IconCheck size={38} stroke="#fff" sw={3}/>
        </div>
      </div>

      {/* found product card (bottom sheet, expanded) */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'var(--bg-surface)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '8px 0 24px',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
          <div style={{ width: 40, height: 5, borderRadius: 9999, background: 'var(--border-strong)', opacity: 0.5 }}/>
        </div>

        {/* match success */}
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px 4px 8px', borderRadius: 9999,
            background: 'rgba(15,110,86,0.10)',
            fontSize: 12, fontWeight: 600, color: TEAL, letterSpacing: 0.2,
          }}>
            <IconCheck size={14} stroke={TEAL} sw={2.5}/>
            Match found
          </div>
        </div>

        {/* product */}
        <div style={{ display: 'flex', gap: 14, padding: '0 20px 16px', alignItems: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 14,
            background: CAT_COLORS.dairy.bg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CatGlyph kind="dairy" color={CAT_COLORS.dairy.fg}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-h2" style={{ marginBottom: 2 }}>Greek yogurt</div>
            <div className="t-caption text-secondary">Chobani · 500 g · Plain</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--text-tertiary)', marginTop: 4, letterSpacing: 0.5,
            }}>818290 014567</div>
          </div>
        </div>

        {/* price comparison strip */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase', color: 'var(--text-tertiary)',
            marginBottom: 8, paddingLeft: 4 }}>Price at nearby stores</div>
          <div style={{
            display: 'flex', gap: 8,
          }}>
            {[
              { store: 'Massy', price: 32.50, here: true },
              { store: 'PriceSmart', price: 28.90, best: true },
              { store: 'Tru Valu', price: 34.50 },
            ].map((p, i) => (
              <div key={i} style={{
                flex: 1, padding: '10px 12px', borderRadius: 12,
                background: p.best ? 'rgba(239,159,39,0.10)' : 'var(--bg-canvas)',
                border: p.best ? '1px solid rgba(239,159,39,0.35)' : '0.5px solid var(--border-default)',
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.store}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>$</span>
                  <span className="t-mono-lg" style={{
                    color: p.best ? AMBER : 'var(--text-primary)',
                  }}>{p.price.toFixed(2)}</span>
                </div>
                {p.here && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: TEAL, marginTop: 2 }}>You're here</div>
                )}
                {p.best && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: AMBER, letterSpacing: 0.4,
                    marginTop: 2, textTransform: 'uppercase' }}>Best</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* qty + add */}
        <div style={{
          padding: '0 16px',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          {/* qty stepper */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-canvas)', borderRadius: 14,
            border: '0.5px solid var(--border-default)',
            padding: 4, height: 50,
          }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={qtyBtn}>−</button>
            <span style={{
              minWidth: 28, textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600,
              color: 'var(--text-primary)',
            }}>{qty}</span>
            <button onClick={() => setQty(qty + 1)} style={qtyBtn}>+</button>
          </div>
          <button style={{
            flex: 1, height: 50, borderRadius: 14,
            background: TEAL, color: '#fff', border: 'none',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Add to list
            <span style={{ opacity: 0.85, fontFamily: 'var(--font-mono)', fontSize: 14 }}>
              · ${(32.50 * qty).toFixed(2)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

const navBtn = {
  width: 36, height: 36, borderRadius: 9999, padding: 0,
  background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const qtyBtn = {
  width: 36, height: 38, borderRadius: 10, padding: 0,
  background: 'var(--bg-surface)', border: '0.5px solid var(--border-default)',
  fontFamily: 'inherit', fontSize: 18, fontWeight: 500,
  color: 'var(--text-primary)', cursor: 'pointer',
};

Object.assign(window, { ScanFoundScreen });
