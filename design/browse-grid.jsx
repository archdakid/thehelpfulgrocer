/* global React, TEAL, AMBER, CAT_COLORS, CatGlyph, IconScan, IconList, IconReceipt, IconUser, IconSearch, IconMore, IconMapPin, IconPlus */

const CAT_TILES = [
  { id: 'produce',  name: 'Produce',    count: 142, lead: 'Avocado · TT$6.50' },
  { id: 'dairy',    name: 'Dairy & eggs', count: 86, lead: 'Whole milk · TT$18.95' },
  { id: 'meat',     name: 'Meat & fish', count: 64,  lead: 'Chicken breast · TT$56.20/lb' },
  { id: 'bakery',   name: 'Bakery',     count: 38,  lead: 'Hops bread · TT$14.00' },
  { id: 'pantry',   name: 'Pantry',     count: 210, lead: 'Basmati rice · TT$89.00' },
  { id: 'frozen',   name: 'Frozen',     count: 72,  lead: 'Vanilla ice cream · TT$42.00' },
  { id: 'beverage', name: 'Beverages',  count: 96,  lead: 'Sparkling water · TT$22.00' },
  { id: 'snacks',   name: 'Snacks',     count: 118, lead: 'Plantain chips · TT$8.50' },
];

function TabBar({ active = 'browse' }) {
  const Item = ({ Ic, label, k, primary }) => {
    if (primary) return (
      <button aria-label="Scan" style={{
        width: 52, height: 52, borderRadius: 9999, marginTop: -18,
        background: TEAL, border: '4px solid var(--bg-surface)',
        boxShadow: '0 4px 12px rgba(15,110,86,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0,
      }}><Ic size={22} stroke="#fff" sw={2.2}/></button>
    );
    const isActive = active === k;
    const c = isActive ? TEAL : 'var(--text-tertiary)';
    return (
      <button style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '4px 12px', color: c,
      }}>
        <Ic size={22} stroke={c} sw={isActive ? 2.2 : 2}/>
        <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{label}</span>
      </button>
    );
  };
  return (
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
        <Item Ic={IconList} label="List" k="list"/>
        <Item Ic={IconSearch} label="Browse" k="browse"/>
        <Item Ic={IconScan} label="Scan" primary/>
        <Item Ic={IconReceipt} label="Receipts" k="receipts"/>
        <Item Ic={IconUser} label="Profile" k="profile"/>
      </div>
    </div>
  );
}

function CategoryTile({ cat }) {
  const c = CAT_COLORS[cat.id] || CAT_COLORS.pantry;
  return (
    <button style={{
      textAlign: 'left', padding: 14, borderRadius: 16,
      background: c.bg, border: 'none',
      display: 'flex', flexDirection: 'column', gap: 8,
      cursor: 'pointer', minHeight: 132,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(255,255,255,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CatGlyph kind={cat.id} color={c.fg}/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: c.fg, letterSpacing: -0.1,
          marginBottom: 2,
        }}>{cat.name}</div>
        <div style={{
          fontSize: 11, color: c.fg, opacity: 0.7, fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
        }}>{cat.count} items</div>
      </div>
      <div style={{
        fontSize: 11, color: c.fg, opacity: 0.78,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{cat.lead}</div>
    </button>
  );
}

function BrowseGridScreen() {
  return (
    <div className="ss-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{ paddingTop: 54, paddingBottom: 6, background: 'var(--bg-canvas)' }}>
        <div style={{ padding: '4px 16px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Browse</div>
          <div className="t-h1" style={{ marginTop: 2 }}>What do you need?</div>
        </div>

        {/* Search field */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-surface)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 12, padding: '0 14px', height: 44,
          }}>
            <IconSearch size={18} stroke="var(--text-tertiary)"/>
            <span style={{ flex: 1, fontSize: 15, color: 'var(--text-tertiary)' }}>
              Search 826 items at Massy
            </span>
            <IconScan size={18} stroke={TEAL}/>
          </div>
        </div>
      </div>

      {/* Scroll */}
      <div className="ss-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* Store context */}
        <div style={{
          margin: '0 16px 14px', padding: '10px 12px',
          borderRadius: 12, background: 'rgba(15,110,86,0.08)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <IconMapPin size={16} stroke={TEAL}/>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
            Showing prices at <span style={{ fontWeight: 600 }}>Massy, Glencoe</span>
          </div>
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: TEAL,
          }}>Change</button>
        </div>

        {/* Section header */}
        <div style={{
          padding: '0 16px 8px',
          fontSize: 12, fontWeight: 600, letterSpacing: 0.6,
          textTransform: 'uppercase', color: 'var(--text-secondary)',
        }}>Categories</div>

        {/* 2-col grid */}
        <div style={{
          padding: '0 12px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        }}>
          {CAT_TILES.map(c => <CategoryTile key={c.id} cat={c}/>)}
        </div>

        {/* Quick add chips */}
        <div style={{
          padding: '20px 16px 8px',
          fontSize: 12, fontWeight: 600, letterSpacing: 0.6,
          textTransform: 'uppercase', color: 'var(--text-secondary)',
        }}>Often bought</div>
        <div className="ss-scroll" style={{
          display: 'flex', gap: 8, padding: '0 16px 16px',
          overflowX: 'auto',
        }}>
          {['Bananas', 'Whole milk', 'Bread', 'Eggs', 'Tomatoes', 'Rice', 'Coffee'].map(t => (
            <button key={t} style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 9999,
              background: 'var(--bg-surface)',
              border: '0.5px solid var(--border-default)',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <IconPlus size={14} stroke={TEAL} sw={2.4}/>
              {t}
            </button>
          ))}
        </div>

        <div style={{ height: 96 }}/>
      </div>

      <TabBar active="browse"/>
    </div>
  );
}

Object.assign(window, { BrowseGridScreen, BrowseTabBar: TabBar });
