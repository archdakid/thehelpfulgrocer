/* global React, CAT_COLORS, CatGlyph, IconCheck, IconScan, IconList, IconReceipt, IconUser, IconSearch, IconMore, IconMapPin, IconPlus */

const TEAL = '#0F6E56';
const AMBER = '#EF9F27';

// ── Store pill ──
const StorePill = ({ store, active, onClick }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 9999, flexShrink: 0,
    background: active ? TEAL : 'var(--bg-surface)',
    color: active ? '#fff' : 'var(--text-primary)',
    border: active ? '0.5px solid transparent' : '0.5px solid var(--border-default)',
    fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
    letterSpacing: -0.1, cursor: 'pointer', minHeight: 36,
  }}>
    {store.detected && (
      <IconMapPin size={13} stroke={active ? '#fff' : TEAL} sw={2.2} />
    )}
    {store.name}
  </button>
);

// ── Checkbox ──
const Check = ({ checked, onClick }) => (
  <button onClick={onClick} aria-label={checked ? 'Uncheck' : 'Check'} style={{
    width: 26, height: 26, borderRadius: 9999, padding: 0,
    border: checked ? 'none' : '1.5px solid var(--border-strong)',
    background: checked ? TEAL : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  }}>
    {checked && <IconCheck size={15} stroke="#fff" sw={2.5} />}
  </button>
);

// ── List row ──
const ItemRow = ({ item, onToggle }) => {
  const cat = CAT_COLORS[item.cat] || CAT_COLORS.pantry;
  const checked = item.checked;
  const total = item.price != null ? item.price * item.qty : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', minHeight: 64,
      borderBottom: '0.5px solid var(--border-default)',
      background: 'var(--bg-surface)',
      opacity: checked ? 0.55 : 1,
      transition: 'opacity 150ms ease-out',
    }}>
      <Check checked={checked} onClick={(e) => { e.stopPropagation(); onToggle(item.id); }} />
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: cat.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <CatGlyph kind={item.cat} color={cat.fg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 16, lineHeight: '22px', fontWeight: 400,
          color: 'var(--text-primary)',
          textDecoration: checked ? 'line-through' : 'none',
          textDecorationColor: 'var(--text-tertiary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span className="t-caption text-secondary" style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.brand} · {item.size}</span>
          {item.qty > 1 && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
              background: 'var(--bg-muted)', padding: '1px 6px', borderRadius: 9999,
              flexShrink: 0,
            }}>×{item.qty}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        {total != null ? (
          <span className="t-mono-lg" style={{ color: 'var(--text-primary)' }}>
            ${total.toFixed(2)}
          </span>
        ) : (
          <span className="t-caption text-tertiary" style={{ fontStyle: 'italic' }}>
            Price unknown
          </span>
        )}
        {item.best && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
            color: '#8A5A1E', background: 'rgba(239,159,39,0.18)',
            padding: '2px 6px', borderRadius: 9999,
            textTransform: 'uppercase',
          }}>Best price</span>
        )}
        {!item.best && item.price != null && item.qty > 1 && (
          <span className="t-caption text-tertiary" style={{ fontFamily: 'var(--font-mono)' }}>
            ${item.price.toFixed(2)} ea
          </span>
        )}
      </div>
    </div>
  );
};

// ── Section header ──
const SectionHeader = ({ label, count, action }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 16px 8px',
  }}>
    <div style={{
      fontSize: 12, fontWeight: 600, letterSpacing: 0.6,
      color: 'var(--text-secondary)', textTransform: 'uppercase',
    }}>
      {label} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 4 }}>{count}</span>
    </div>
    {action && (
      <button onClick={action.onClick} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: TEAL,
      }}>{action.label}</button>
    )}
  </div>
);

Object.assign(window, { StorePill, Check, ItemRow, SectionHeader, TEAL, AMBER });
