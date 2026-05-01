/* global React, TEAL, AMBER, CAT_COLORS, CatGlyph, IconScan, IconList, IconReceipt, IconUser, IconSearch, IconMore, IconMapPin, IconPlus, IconCheck, BrowseTabBar */

// items in Dairy & eggs — multiple stores, sorted by best price for each
const DAIRY_ITEMS = [
  {
    id: 1, name: 'Whole milk',
    brand: 'Nestlé', size: '1 L',
    bestStore: 'PriceSmart', bestPrice: 16.50,
    here: 18.95, hereDelta: -2.45,
    inList: true,
  },
  {
    id: 2, name: 'Greek yogurt, plain',
    brand: 'Chobani', size: '500 g',
    bestStore: 'PriceSmart', bestPrice: 28.90,
    here: 32.50, hereDelta: -3.60,
    inList: false,
  },
  {
    id: 3, name: 'Eggs, large brown',
    brand: 'Hi-Lo', size: 'Dozen',
    bestStore: 'Massy', bestPrice: 32.50,
    here: 32.50, hereDelta: 0,
    inList: false, hereBest: true,
  },
  {
    id: 4, name: 'Cheddar cheese',
    brand: 'Anchor', size: '250 g',
    bestStore: 'Tru Valu', bestPrice: 36.00,
    here: 38.00, hereDelta: -2.00,
    inList: false,
  },
  {
    id: 5, name: 'Butter, salted',
    brand: 'Anchor', size: '227 g',
    bestStore: 'JTA', bestPrice: 24.50,
    here: 26.95, hereDelta: -2.45,
    inList: false,
  },
  {
    id: 6, name: 'Coconut milk',
    brand: 'Grace', size: '400 mL',
    bestStore: 'Massy', bestPrice: 9.95,
    here: 9.95, hereDelta: 0,
    inList: false, hereBest: true,
  },
  {
    id: 7, name: 'Almond milk, unsweetened',
    brand: 'Silk', size: '946 mL',
    bestStore: 'PriceSmart', bestPrice: 38.00,
    here: 44.50, hereDelta: -6.50,
    inList: false,
  },
];

// Sort state demo: best price asc
function ProductRow({ item }) {
  const c = CAT_COLORS.dairy;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', minHeight: 72,
      borderBottom: '0.5px solid var(--border-default)',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: c.bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CatGlyph kind="dairy" color={c.fg}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6,
        }}>
          <div style={{
            fontSize: 15, lineHeight: '20px', fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>{item.name}</div>
          {item.inList && (
            <span style={{
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
              color: TEAL, background: 'rgba(15,110,86,0.10)',
              padding: '2px 6px', borderRadius: 9999, textTransform: 'uppercase',
            }}>
              <IconCheck size={10} stroke={TEAL} sw={3}/>
              On list
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span className="t-caption text-secondary" style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.brand} · {item.size}</span>
        </div>
        {/* Best at … strip */}
        <div style={{
          marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--text-secondary)',
        }}>
          {item.hereDelta < 0 ? (
            <>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: '#8A5A1E', background: 'rgba(239,159,39,0.18)',
                padding: '1px 6px', borderRadius: 9999, fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}>${item.bestPrice.toFixed(2)} at {item.bestStore}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>save ${Math.abs(item.hereDelta).toFixed(2)}</span>
            </>
          ) : (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              color: TEAL, textTransform: 'uppercase',
            }}>Best price here</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span className="t-mono-lg" style={{
          color: item.hereDelta < 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}>${item.here.toFixed(2)}</span>
        <button aria-label="Add" style={{
          width: 32, height: 32, borderRadius: 9999, padding: 0,
          background: item.inList ? 'rgba(15,110,86,0.10)' : TEAL,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {item.inList
            ? <IconCheck size={16} stroke={TEAL} sw={2.4}/>
            : <IconPlus size={16} stroke="#fff" sw={2.4}/>}
        </button>
      </div>
    </div>
  );
}

function FilterChip({ label, active, dot }) {
  return (
    <button style={{
      flexShrink: 0, padding: '6px 12px', borderRadius: 9999,
      background: active ? 'var(--text-primary)' : 'var(--bg-surface)',
      color: active ? '#fff' : 'var(--text-primary)',
      border: active ? 'none' : '0.5px solid var(--border-default)',
      fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {dot && <span style={{
        width: 6, height: 6, borderRadius: 9999,
        background: active ? '#fff' : TEAL,
      }}/>}
      {label}
    </button>
  );
}

function BrowseDetailScreen() {
  const c = CAT_COLORS.dairy;
  return (
    <div className="ss-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{
        paddingTop: 54, paddingBottom: 4,
        background: c.bg,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 16px 6px',
        }}>
          <button aria-label="Back" style={{
            width: 36, height: 36, borderRadius: 9999, padding: 0,
            background: 'rgba(255,255,255,0.7)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke={c.fg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div style={{
            flex: 1, fontSize: 13, fontWeight: 600, color: c.fg, opacity: 0.7,
            letterSpacing: 0.4, textTransform: 'uppercase',
          }}>Browse</div>
          <button aria-label="Search" style={{
            width: 36, height: 36, borderRadius: 9999, padding: 0,
            background: 'rgba(255,255,255,0.7)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}><IconSearch size={18} stroke={c.fg}/></button>
        </div>

        {/* Title row */}
        <div style={{ padding: '4px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CatGlyph kind="dairy" color={c.fg}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 24, lineHeight: '28px', fontWeight: 600,
              color: c.fg, letterSpacing: -0.3,
            }}>Dairy & eggs</div>
            <div style={{
              fontSize: 13, color: c.fg, opacity: 0.78, marginTop: 2,
              fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            }}>86 items · 5 stores tracked</div>
          </div>
        </div>
      </div>

      {/* Filter chips row */}
      <div style={{
        background: 'var(--bg-canvas)',
        borderBottom: '0.5px solid var(--border-default)',
        padding: '10px 0',
      }}>
        <div className="ss-scroll" style={{
          display: 'flex', gap: 8, padding: '0 16px',
          overflowX: 'auto',
        }}>
          <FilterChip label="All" active/>
          <FilterChip label="Milk · 12"/>
          <FilterChip label="Yogurt · 18"/>
          <FilterChip label="Cheese · 24"/>
          <FilterChip label="Eggs · 8"/>
          <FilterChip label="Butter · 9"/>
        </div>
      </div>

      {/* Sort row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px 6px', background: 'var(--bg-canvas)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>7</span> items shown
        </div>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: TEAL,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          Sort: Best savings
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={TEAL} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </button>
      </div>

      {/* Items */}
      <div className="ss-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{
          margin: '4px 12px',
          background: 'var(--bg-surface)',
          borderRadius: 16, overflow: 'hidden',
          border: '0.5px solid var(--border-default)',
        }}>
          {DAIRY_ITEMS.map(it => <ProductRow key={it.id} item={it}/>)}
        </div>
        <div style={{ height: 96 }}/>
      </div>

      <BrowseTabBar active="browse"/>
    </div>
  );
}

Object.assign(window, { BrowseDetailScreen });
