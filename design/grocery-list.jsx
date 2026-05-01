/* global React, StorePill, ItemRow, SectionHeader, TEAL, AMBER, IconScan, IconList, IconReceipt, IconUser, IconSearch, IconMore, IconPlus */

const STORES = [
  { id: 'massy', name: 'Massy', detected: true },
  { id: 'pricesmart', name: 'PriceSmart' },
  { id: 'jta', name: 'JTA' },
  { id: 'tru', name: 'Tru Valu' },
  { id: 'xtra', name: 'Xtra Foods' },
];

const SEED = [
  { id: 1, name: 'Hass avocados', brand: 'Loose', size: 'each', cat: 'produce', qty: 4, price: 6.50, best: true, checked: false },
  { id: 2, name: 'Whole milk', brand: 'Nestlé', size: '1 L', cat: 'dairy', qty: 2, price: 18.95, best: false, checked: false },
  { id: 3, name: 'Hops bread', brand: 'Local bakery', size: '6-pack', cat: 'bakery', qty: 1, price: 14.00, best: false, checked: false },
  { id: 4, name: 'Chicken breast', brand: 'Fresh', size: '~1.5 lb', cat: 'meat', qty: 1, price: 56.20, best: false, checked: false },
  { id: 5, name: 'Greek yogurt', brand: 'Chobani', size: '500 g', cat: 'dairy', qty: 1, price: 32.50, best: true, checked: false },
  { id: 6, name: 'Roma tomatoes', brand: 'Loose', size: 'lb', cat: 'produce', qty: 2, price: 8.75, best: false, checked: false },
  { id: 7, name: 'Sparkling water', brand: 'Solo', size: '6×500 mL', cat: 'beverage', qty: 1, price: 22.00, best: false, checked: false },
  { id: 8, name: 'Basmati rice', brand: 'Tilda', size: '5 kg', cat: 'pantry', qty: 1, price: null, best: false, checked: false },
  { id: 9, name: 'Plantain chips', brand: 'Sunshine', size: '85 g', cat: 'snacks', qty: 3, price: 8.50, best: false, checked: true },
  { id: 10, name: 'Cheddar cheese', brand: 'Anchor', size: '250 g', cat: 'dairy', qty: 1, price: 38.00, best: false, checked: true },
];

function GroceryListScreen() {
  const [items, setItems] = React.useState(SEED);
  const [activeStore, setActiveStore] = React.useState('massy');

  const toggle = (id) => setItems(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i));

  const remaining = items.filter(i => !i.checked);
  const inCart = items.filter(i => i.checked);
  const sumOf = (arr) => arr.reduce((s, i) => s + (i.price != null ? i.price * i.qty : 0), 0);
  const remTotal = sumOf(remaining);
  const cartTotal = sumOf(inCart);
  const grandTotal = remTotal + cartTotal;
  const cartPct = grandTotal > 0 ? (cartTotal / grandTotal) * 100 : 0;
  const storeName = STORES.find(s => s.id === activeStore).name;

  return (
    <div className="ss-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Top — title + actions */}
      <div style={{ paddingTop: 54, paddingBottom: 4, background: 'var(--bg-canvas)' }}>
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
            <button aria-label="Search" style={iconBtn}><IconSearch size={20} stroke="var(--text-primary)"/></button>
            <button aria-label="More" style={iconBtn}><IconMore size={20} stroke="var(--text-primary)"/></button>
          </div>
        </div>

        {/* store pills */}
        <div className="ss-scroll" style={{
          display: 'flex', gap: 8, padding: '0 16px 12px',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {STORES.map(s => (
            <StorePill key={s.id} store={s} active={s.id === activeStore} onClick={() => setActiveStore(s.id)} />
          ))}
        </div>
      </div>

      {/* List */}
      <div className="ss-scroll" style={{
        flex: 1, overflowY: 'auto', background: 'var(--bg-canvas)',
      }}>
        <SectionHeader label="To buy" count={remaining.length} />
        <div style={{
          margin: '0 12px', borderRadius: 16, overflow: 'hidden',
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border-default)',
        }}>
          {remaining.map(it => <ItemRow key={it.id} item={it} onToggle={toggle} />)}
        </div>

        {inCart.length > 0 && (
          <>
            <SectionHeader label="In cart" count={inCart.length}
              action={{ label: 'Clear', onClick: () => setItems(items.filter(i => !i.checked)) }} />
            <div style={{
              margin: '0 12px', borderRadius: 16, overflow: 'hidden',
              background: 'var(--bg-surface)',
              border: '0.5px solid var(--border-default)',
            }}>
              {inCart.map(it => <ItemRow key={it.id} item={it} onToggle={toggle} />)}
            </div>
          </>
        )}
        {/* footer + tab clearance */}
        <div style={{ height: 240 }} />
      </div>

      {/* Floating Add */}
      <button aria-label="Add item" style={{
        position: 'absolute', right: 16, bottom: 196, zIndex: 4,
        width: 52, height: 52, borderRadius: 9999,
        background: 'var(--bg-surface)', border: '0.5px solid var(--border-default)',
        boxShadow: '0 6px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0,
      }}>
        <IconPlus size={22} stroke="var(--text-primary)" />
      </button>

      {/* Sticky running-total footer */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 80, zIndex: 3,
        margin: '0 12px',
        background: 'var(--bg-surface)',
        border: '0.5px solid var(--border-default)',
        borderRadius: 20,
        padding: '12px 14px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
      }}>
        {/* split row */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
              textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              Total at {storeName}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>TT$</span>
              <span className="t-mono-display" style={{ color: 'var(--text-primary)' }}>
                {grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-caption" style={{ color: AMBER, fontWeight: 600 }}>
              Save TT$14.20 at PriceSmart
            </div>
            <button style={{
              background: 'none', border: 'none', padding: 0, marginTop: 2,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: TEAL, cursor: 'pointer',
            }}>Compare stores ›</button>
          </div>
        </div>

        {/* progress bar: cart / total */}
        <div style={{
          height: 6, borderRadius: 9999, background: 'var(--bg-muted)',
          overflow: 'hidden', marginBottom: 8,
        }}>
          <div style={{
            width: `${cartPct}%`, height: '100%', background: TEAL,
            transition: 'width 200ms ease-out',
          }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: TEAL }}>${cartTotal.toFixed(2)}</span> in cart · {inCart.length}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>${remTotal.toFixed(2)}</span> remaining · {remaining.length}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        flexShrink: 0, position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2,
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
            if (t.primary) {
              return (
                <button key={i} aria-label="Scan" style={{
                  width: 52, height: 52, borderRadius: 9999, marginTop: -18,
                  background: TEAL, border: '4px solid var(--bg-surface)',
                  boxShadow: '0 4px 12px rgba(15,110,86,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}>
                  <t.Ic size={22} stroke="#fff" sw={2.2}/>
                </button>
              );
            }
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

const iconBtn = {
  width: 36, height: 36, borderRadius: 9999, padding: 0,
  background: 'var(--bg-surface)', border: '0.5px solid var(--border-default)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
};

Object.assign(window, { GroceryListScreen });
