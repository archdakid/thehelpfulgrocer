/* global React, CAT_COLORS, CatGlyph, IconCheck, IconScan, IconList, IconReceipt, IconUser, IconSearch, IconMore, IconMapPin, IconPlus, TEAL, AMBER, StorePill */

// ── Empty state for screen 2 ──
function EmptyListScreen() {
  return (
    <div className="ss-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ paddingTop: 54, paddingBottom: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '4px 16px 10px',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
              textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Shopping at</div>
            <div className="t-h1" style={{ marginTop: 2 }}>Weekly groceries</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button aria-label="Search" style={{
              width: 36, height: 36, borderRadius: 9999, padding: 0,
              background: 'var(--bg-surface)', border: '0.5px solid var(--border-default)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><IconSearch size={20} stroke="var(--text-primary)"/></button>
          </div>
        </div>
        <div className="ss-scroll" style={{
          display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto',
        }}>
          <StorePill store={{ id: 'massy', name: 'Massy', detected: true }} active={true} onClick={()=>{}} />
          <StorePill store={{ id: 'pricesmart', name: 'PriceSmart' }} active={false} onClick={()=>{}} />
          <StorePill store={{ id: 'jta', name: 'JTA' }} active={false} onClick={()=>{}} />
          <StorePill store={{ id: 'tru', name: 'Tru Valu' }} active={false} onClick={()=>{}} />
        </div>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px', textAlign: 'center', gap: 16,
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: 24,
          background: 'rgba(15,110,86,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={TEAL}
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 6h14l-1.5 12a2 2 0 0 1-2 1.7H8.5a2 2 0 0 1-2-1.7L5 6z"/>
            <path d="M9 6V4a3 3 0 0 1 6 0v2"/>
          </svg>
        </div>
        <div>
          <div className="t-h2" style={{ marginBottom: 6 }}>Your list is empty</div>
          <div className="t-body text-secondary" style={{ maxWidth: 280, margin: '0 auto' }}>
            Scan a barcode, search for a product, or type to add the first item.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 }}>
          <button style={{
            height: 52, borderRadius: 16, border: 'none',
            background: TEAL, color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 16, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <IconScan size={20} stroke="#fff"/> Scan an item
          </button>
          <button style={{
            height: 44, borderRadius: 16,
            background: 'var(--bg-surface)', border: '0.5px solid var(--border-default)',
            color: 'var(--text-primary)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <IconSearch size={18} stroke="var(--text-primary)"/> Search products
          </button>
          <button style={{
            height: 44, borderRadius: 16,
            background: 'transparent', border: 'none',
            color: TEAL, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          }}>+ Type an item</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'var(--bg-surface)',
        borderTop: '0.5px solid var(--border-default)',
        paddingBottom: 22,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '8px 8px 4px',
        }}>
          {[
            { Ic: IconList, label: 'List', active: true },
            { Ic: IconSearch, label: 'Browse' },
            { Ic: IconScan, label: 'Scan', primary: true },
            { Ic: IconReceipt, label: 'Receipts' },
            { Ic: IconUser, label: 'Profile' },
          ].map((t, i) => {
            if (t.primary) return (
              <button key={i} aria-label="Scan" style={{
                width: 52, height: 52, borderRadius: 9999, marginTop: -18,
                background: TEAL, border: '4px solid var(--bg-surface)',
                boxShadow: '0 4px 12px rgba(15,110,86,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0,
              }}><t.Ic size={22} stroke="#fff" sw={2.2}/></button>
            );
            const c = t.active ? TEAL : 'var(--text-tertiary)';
            return (
              <button key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 12px', color: c,
              }}>
                <t.Ic size={22} stroke={c} sw={t.active ? 2.2 : 2}/>
                <span style={{ fontSize: 10, fontWeight: t.active ? 600 : 400 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EmptyListScreen });
