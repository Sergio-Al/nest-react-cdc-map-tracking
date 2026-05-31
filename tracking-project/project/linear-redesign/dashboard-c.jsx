// DashboardC — "Mission Control Pro"
// Intercom inbox shape + Linear precision:
//   [icon rail · driver inbox · map workspace · driver detail panel]

// ── Icon rail (Linear-style) ────────────────────────────

function IconRail() {
  const navs = [
    { id: 'live',       label: 'Live',       ic: Ic.mapPin,   active: true },
    { id: 'history',    label: 'History',    ic: Ic.history },
    { id: 'routes',     label: 'Routes',     ic: Ic.route },
    { id: 'drivers',    label: 'Drivers',    ic: Ic.users },
    { id: 'vehicles',   label: 'Vehicles',   ic: Ic.truck },
    { id: 'customers',  label: 'Customers',  ic: Ic.building },
  ];
  const sec = [
    { id: 'monitoring', label: 'Monitoring', ic: Ic.activity },
  ];
  return (
    <aside className="rail">
      <div className="rail-logo">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7l5-3 8 4 5-3v13l-5 3-8-4-5 3V7z" stroke="oklch(0.99 0 0)" strokeWidth="1.6" strokeLinejoin="round"/>
        </svg>
      </div>
      {navs.map(n => (
        <button key={n.id} className={`rail-btn ${n.active ? 'active' : ''}`} aria-label={n.label} title={n.label}>
          {n.ic}
        </button>
      ))}
      <div className="rail-sep" />
      {sec.map(n => (
        <button key={n.id} className="rail-btn" aria-label={n.label} title={n.label}>
          {n.ic}
        </button>
      ))}
      <div className="rail-bottom">
        <button className="rail-btn" aria-label="Notifications" title="Notifications">
          {Ic.bell}
        </button>
        <button className="rail-av" title="John Doe · Dispatcher">JD</button>
      </div>
    </aside>
  );
}

// ── Driver inbox (middle column) ────────────────────────

const STATUS_LABEL = {
  moving:  'En route',
  idle:    'Idle',
  offline: 'Offline',
};

function InboxRow({ d }) {
  const snippet =
    d.status === 'offline'
      ? `Last seen ${d.lastUpdate}`
      : `${d.route} · ${d.progress}/${d.total} stops`;
  const isAttn = d.status === 'idle' && d.lastUpdate.includes('m');
  const isDone = d.progress / d.total >= 0.9;
  const tag =
    isAttn ? <span className="inbox-tag attn">attention</span>
    : isDone ? <span className="inbox-tag done">{Math.round(d.progress / d.total * 100)}%</span>
    : null;

  return (
    <div className={`inbox-row ${d.status} ${d.selected ? 'selected' : ''} ${isAttn ? 'unread' : ''}`}>
      <div className="inbox-av-wrap">
        <div className="inbox-av">{d.initials}</div>
        <div className="inbox-av-dot" />
      </div>
      <div className="inbox-main">
        <div className="inbox-name">{d.name}</div>
        <div className="inbox-snippet">{snippet}</div>
      </div>
      <div className="inbox-meta">
        <span className="inbox-time">{d.lastUpdate}</span>
        {tag}
      </div>
    </div>
  );
}

function DriverInbox() {
  const counts = {
    all: DRIVERS.length,
    moving: DRIVERS.filter(d => d.status === 'moving').length,
    idle: DRIVERS.filter(d => d.status === 'idle').length,
    offline: DRIVERS.filter(d => d.status === 'offline').length,
  };
  return (
    <section className="inbox">
      <div className="inbox-head">
        <div className="inbox-head-row">
          <span className="inbox-title">Fleet</span>
          <span className="inbox-count mono">{counts.all}</span>
          <div className="inbox-head-actions">
            <button className="hdr-icon-btn" title="Filter">{Ic.filter}</button>
            <button className="hdr-icon-btn" title="New driver">{Ic.plus}</button>
          </div>
        </div>
        <div className="inbox-search">
          {Ic.search}
          <span>Search drivers, plates…</span>
          <span className="kbd">/</span>
        </div>
      </div>
      <div className="inbox-filters">
        <button className="chip active">
          <span>All</span><span className="ct mono">{counts.all}</span>
        </button>
        <button className="chip">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-moving)' }} />
          <span>Moving</span><span className="ct mono">{counts.moving}</span>
        </button>
        <button className="chip">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-idle)' }} />
          <span>Idle</span><span className="ct mono">{counts.idle}</span>
        </button>
        <button className="chip chip-sort" title="Sort">
          <span>Speed</span>
          {Ic.chevDown}
        </button>
      </div>
      <div className="inbox-list">
        {DRIVERS.map(d => <InboxRow key={d.id} d={d} />)}
      </div>
    </section>
  );
}

// ── Workspace header (breadcrumb + ⌘K) ──────────────────

function WorkspaceHead() {
  return (
    <div className="workspace-head">
      <div className="wh-breadcrumb">
        <span className="crumb">Fleet</span>
        <span className="sep">/</span>
        <span className="crumb last">Live operations</span>
      </div>
      <span className="wh-sub mono">· La Paz, Bolivia</span>
      <div className="wh-actions">
        <div className="hdr-cmdk" style={{ width: 260, height: 28 }}>
          {Ic.search}
          <span style={{ fontSize: 12 }}>Quick search…</span>
          <span className="kbd">⌘K</span>
        </div>
        <button className="btn">{Ic.filter}<span>Filters</span></button>
        <button className="btn primary">{Ic.plus}<span>New route</span></button>
      </div>
    </div>
  );
}

function MapWorkspace({ showGrid }) {
  const selected = DRIVERS.find(d => d.selected) || DRIVERS[3];
  return (
    <section className="workspace">
      <WorkspaceHead />
      <div className="map-wrap">
        <PseudoMap />
        {showGrid && <div className="map-grid-overlay" />}
        <MapLabels />
        <MapControls side="right" />
        <VehiclePins />

        <div className="tracking-chip">
          <span className="av mono">{selected.initials}</span>
          <span className="live-dot" />
          <span className="label">Now tracking</span>
          <span className="name">{selected.name}</span>
          <span className="label mono">· {selected.plate}</span>
        </div>

        <div className="mini-stats">
          <div className="mini-stat">
            <div className="mini-stat-label">Active</div>
            <div className="mini-stat-value">5<span className="unit">/8</span></div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat-label">Avg speed</div>
            <div className="mini-stat-value">33<span className="unit">km/h</span></div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat-label">Visits</div>
            <div className="mini-stat-value">40<span className="unit">today</span></div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat-label">Distance</div>
            <div className="mini-stat-value">466<span className="unit">km</span></div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat-label">On-time</div>
            <div className="mini-stat-value">94<span className="unit">%</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Driver detail panel (right) ─────────────────────────

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function SpeedSparkline() {
  // Pseudo-historical speed bars (last 24 readings)
  const heights = [22, 30, 35, 28, 18, 12, 20, 38, 42, 50, 55, 58, 60, 52, 48, 56, 62, 70, 65, 58, 52, 48, 45, 58];
  const max = Math.max(...heights);
  return (
    <div className="spark">
      {heights.map((h, i) => (
        <div
          key={i}
          className={`spark-bar ${i === heights.length - 1 ? 'hi' : ''}`}
          style={{ height: `${(h / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function DriverPanel() {
  const d = DRIVERS.find(x => x.selected) || DRIVERS[3];

  const stops = [
    { name: 'San Miguel Plaza',    sub: 'Cliente Andes Foods',         time: '08:12', state: 'done' },
    { name: 'Av. Ballivián 1320',  sub: 'Cliente Tigo Money',          time: '09:04', state: 'done' },
    { name: 'Calle 21 · Calacoto', sub: 'Cliente Farmacorp',           time: '09:48', state: 'done' },
    { name: 'Av. Hernando Siles',  sub: 'Cliente Hipermaxi #3',        time: '10:22', state: 'done' },
    { name: 'Calle Sagárnaga 247', sub: 'Cliente Mercantil',           time: '11:01', state: 'done' },
    { name: 'Calle Comercio',      sub: 'Cliente Bisa Bank',           time: '11:47', state: 'done' },
    { name: 'Av. Camacho 1280',    sub: 'Cliente Entel',               time: '12:18', state: 'done' },
    { name: 'Av. Arce esq. Goitia', sub: 'Cliente Embol — en curso',   time: 'ETA 12:46', state: 'current' },
    { name: 'Plaza Avaroa',        sub: 'Cliente Tigo Star',           time: 'ETA 13:20', state: '' },
    { name: 'Av. 6 de Agosto',     sub: 'Cliente Coca-Cola Bolivia',   time: 'ETA 13:58', state: '' },
  ];

  const events = [
    { time: '12:34', dot: 'accent', text: <><span className="em">Arrived at</span> <span className="accent">Av. Arce esq. Goitia</span></> },
    { time: '12:18', dot: 'moving', text: <><span className="em">Departed</span> Av. Camacho 1280 <span className="em">·</span> <span className="mono">2.4 km</span></> },
    { time: '12:14', dot: 'moving', text: <><span className="em">Visit completed</span> · Entel</> },
    { time: '11:58', dot: 'idle',   text: <><span className="em">Idle for 4 min</span> · awaiting customer</> },
    { time: '11:47', dot: 'moving', text: <><span className="em">Arrived at</span> Av. Camacho 1280</> },
    { time: '11:01', dot: 'moving', text: <><span className="em">Visit completed</span> · Mercantil</> },
    { time: '07:30', dot: '',       text: <><span className="em">Shift started</span> · vehicle <span className="mono">{d.plate}</span></> },
  ];

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-head-top">
          <div className="panel-av">{d.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="panel-name">{d.name}</div>
            <div className="panel-sub">{d.plate} · {d.route}</div>
          </div>
          <span className={`status-badge ${d.status}`}>
            <span className="dot"/>{STATUS_LABEL[d.status]}
          </span>
        </div>
        <div className="panel-actions">
          <button className="btn primary">{Ic.navi}<span>Track</span></button>
          <button className="btn">{Ic.phone}<span>Call</span></button>
          <button className="btn">{Ic.route}<span>Route</span></button>
        </div>
      </div>

      <div className="panel-tabs">
        <button className="panel-tab active">Activity <span className="ct mono">12</span></button>
        <button className="panel-tab">Stops <span className="ct mono">10</span></button>
        <button className="panel-tab">Vehicle</button>
        <button className="panel-tab">Notes</button>
      </div>

      <div className="panel-body">
        {/* Top-line KV grid */}
        <div className="kv-grid">
          <div>
            <div className="kv-label">Speed</div>
            <div className="kv-value">{d.speed} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>km/h</span></div>
          </div>
          <div>
            <div className="kv-label">Distance</div>
            <div className="kv-value">{d.distance.toFixed(1)} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>km</span></div>
          </div>
          <div>
            <div className="kv-label">Last ping</div>
            <div className="kv-value">{d.lastUpdate}</div>
          </div>
          <div>
            <div className="kv-label">Visits</div>
            <div className="kv-value">{d.progress}<span style={{ color: 'var(--text-dim)' }}>/{d.total}</span></div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="panel-section">
          <div className="panel-section-label">Speed · last 60 min</div>
          <SpeedSparkline />
        </div>

        {/* Route progress with stops */}
        <div className="panel-section">
          <div className="panel-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Route · {d.route}</span>
            <span className="mono" style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>{d.progress}/{d.total}</span>
          </div>
          <ProgressBar done={d.progress} total={d.total} />
          <div className="stops">
            {stops.map((s, i) => (
              <div key={i} className={`stop ${s.state}`}>
                <div className="stop-dot">
                  {s.state === 'done' && <CheckSvg />}
                </div>
                <div className="stop-body">
                  <div className="stop-name">{s.name}</div>
                  <div className="stop-sub">{s.sub}</div>
                </div>
                <div className="stop-time">{s.time}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity timeline */}
        <div className="panel-section">
          <div className="panel-section-label">Activity</div>
          <div className="timeline">
            {events.map((e, i) => (
              <div key={i} className="tev">
                <div className={`tev-dot ${e.dot}`} />
                <div className="tev-body">
                  <div className="tev-text">{e.text}</div>
                  <div className="tev-time">{e.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── DashboardC ──────────────────────────────────────────

function DashboardC({ theme = 'c', showGrid = true }) {
  // theme = 'c' (warm dark) or 'dark' or 'light' for variant
  const themeClass = theme === 'c' ? 'theme-c' : `theme-${theme}`;
  return (
    <div className={`app ${themeClass}`}>
      <div className="body" style={{ flex: 1 }}>
        <IconRail />
        <DriverInbox />
        <MapWorkspace showGrid={showGrid} />
        <DriverPanel />
      </div>
      <Footer />
    </div>
  );
}

Object.assign(window, { DashboardC });
