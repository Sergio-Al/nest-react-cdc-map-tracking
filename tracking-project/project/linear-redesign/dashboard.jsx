// FleetTrack redesign — two dashboard layouts.
//
// DashboardA (dark / sidebar-left / floating stats + ⌘K palette open)
// DashboardB (light / sidebar-right / inline stat row + driver detail card)

// ── Shared atoms ──────────────────────────────────────────

function Logo() {
  return (
    <div className="hdr-brand">
      <div className="hdr-brand-mark">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 7l5-3 8 4 5-3v13l-5 3-8-4-5 3V7z" stroke="oklch(0.99 0 0)" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
        </svg>
      </div>
      <span className="hdr-brand-name">FleetTrack</span>
    </div>
  );
}

function HeaderNav({ active = 'live' }) {
  const items = [
    { id: 'live',       label: 'Live',      ic: Ic.mapPin },
    { id: 'history',    label: 'History',   ic: Ic.history },
    { id: 'routes',     label: 'Routes',    ic: Ic.route },
    { id: 'drivers',    label: 'Drivers',   ic: Ic.users },
    { id: 'vehicles',   label: 'Vehicles',  ic: Ic.truck },
    { id: 'customers',  label: 'Customers', ic: Ic.building },
    { id: 'monitoring', label: 'Monitoring', ic: Ic.activity },
  ];
  return (
    <nav className="hdr-nav">
      {items.map(it => (
        <button key={it.id} className={it.id === active ? 'active' : ''}>
          {it.ic}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

function CmdKBar() {
  return (
    <div className="hdr-search">
      <div className="hdr-cmdk">
        {Ic.search}
        <span>Search drivers, routes, customers…</span>
        <span className="kbd">⌘K</span>
      </div>
    </div>
  );
}

function HeaderRight({ name = 'John Doe', role = 'Dispatcher', initials = 'JD' }) {
  return (
    <div className="hdr-right">
      <button className="hdr-icon-btn" aria-label="Notifications">
        {Ic.bell}
        <span className="dot" />
      </button>
      <button className="hdr-user">
        <span className="hdr-user-av">{initials}</span>
        <span style={{ textAlign: 'left', lineHeight: 1.15 }}>
          <div className="hdr-user-name">{name}</div>
          <div className="hdr-user-role">{role}</div>
        </span>
        {Ic.chevDown}
      </button>
    </div>
  );
}

function Header({ active = 'live' }) {
  return (
    <header className="hdr">
      <Logo />
      <HeaderNav active={active} />
      <CmdKBar />
      <HeaderRight />
    </header>
  );
}

// ── Driver list ──────────────────────────────────────────

function ProgressBar({ done, total, segments = 10 }) {
  const segs = Array.from({ length: total }, (_, i) => {
    if (i < done) return 'done';
    if (i === done) return 'current';
    return '';
  });
  return (
    <div className="progress" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}>
      {segs.map((cls, i) => (
        <div key={i} className={`progress-seg ${cls}`} />
      ))}
    </div>
  );
}

function DriverCard({ d }) {
  return (
    <div className={`dcard ${d.status} ${d.selected ? 'selected' : ''}`}>
      <span className="dcard-bar" />
      <div className="dcard-row1">
        <span className="dcard-av">{d.initials}</span>
        <span className="dcard-name">{d.name}</span>
        <span className="dcard-plate mono">{d.plate}</span>
      </div>
      <div className="dcard-row2">
        <span>{d.speed} km/h</span>
        <span className="sep">·</span>
        <span>{d.lastUpdate}</span>
        <span className="sep">·</span>
        <span>{d.distance.toFixed(1)} km</span>
      </div>
      <div className="dcard-route">
        <span className="dcard-route-name">{d.route}</span>
        <span className="dcard-route-count">{d.progress}/{d.total}</span>
      </div>
      <ProgressBar done={d.progress} total={d.total} />
    </div>
  );
}

function FleetSidebar({ side = 'left' }) {
  const counts = {
    all: DRIVERS.length,
    moving: DRIVERS.filter(d => d.status === 'moving').length,
    idle: DRIVERS.filter(d => d.status === 'idle').length,
    offline: DRIVERS.filter(d => d.status === 'offline').length,
  };
  const tabs = [
    { id: 'all',     label: 'All' },
    { id: 'moving',  label: 'Moving' },
    { id: 'idle',    label: 'Idle' },
    { id: 'offline', label: 'Offline' },
  ];
  return (
    <aside className={`sb ${side}`}>
      <div className="sb-head">
        <div className="sb-title">Fleet Overview</div>
        <div className="sb-pill">
          <span className="live-dot" />
          <span>LIVE</span>
        </div>
      </div>

      <div className="sb-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`sb-tab ${t.id === 'all' ? 'active' : ''}`}>
            <span>{t.label}</span>
            <span className="count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="sb-toolbar">
        <div className="sb-search">
          {Ic.search}
          <span>Name or plate…</span>
          <span className="kbd">/</span>
        </div>
        <div className="sb-actions">
          <button className="btn primary flex">{Ic.plus}<span>Create Route</span></button>
          <button className="btn flex">{Ic.userPlus}<span>Assign</span></button>
        </div>
      </div>

      <div className="sb-list">
        {DRIVERS.map(d => <DriverCard key={d.id} d={d} />)}
      </div>
    </aside>
  );
}

// ── Stats ────────────────────────────────────────────────

function StatStrip({ items, floating = false }) {
  return (
    <div className={`stat-strip ${floating ? 'stats-floating' : ''}`}>
      {items.map((s, i) => (
        <div key={i} className="stat">
          <div className="stat-label">{s.icon}<span>{s.label}</span></div>
          <div className="stat-value mono">
            {s.value}<span className="unit">{s.unit}</span>
          </div>
          <div className={`stat-delta ${s.dir}`}>
            {s.dir === 'up' ? Ic.arrowUp : Ic.arrowDown}
            <span>{s.delta} today</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatRow({ items }) {
  return (
    <div className="stat-row">
      {items.map((s, i) => (
        <div key={i} className="stat-inline">
          <div className="stat-label">{s.icon}<span>{s.label}</span></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="stat-value mono">
              {s.value}<span className="unit">{s.unit}</span>
            </div>
            <div className={`stat-delta ${s.dir}`}>
              {s.dir === 'up' ? Ic.arrowUp : Ic.arrowDown}
              <span>{s.delta}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const STAT_ITEMS = [
  { ...STATS.active,   icon: Ic.truck },
  { ...STATS.speed,    icon: Ic.speed },
  { ...STATS.visits,   icon: Ic.mapPin },
  { ...STATS.distance, icon: Ic.navi },
  { ...STATS.ontime,   icon: Ic.clock },
];

// ── Map controls + legend ───────────────────────────────

function MapControls({ side = 'right' }) {
  return (
    <div className={`map-controls ${side === 'left' ? 'left' : ''}`}>
      <div className="map-ctrl-group">
        <button className="map-ctrl" aria-label="Zoom in">{Ic.plus2}</button>
        <button className="map-ctrl" aria-label="Zoom out">{Ic.minus}</button>
      </div>
      <button className="map-ctrl" aria-label="Recenter">{Ic.locate}</button>
      <button className="map-ctrl" aria-label="Follow">{Ic.navi}</button>
      <button className="map-ctrl" aria-label="Layers">{Ic.layers}</button>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="legend">
      <div className="legend-grp">
        <div className="legend-grp-label">Driver status</div>
        <div className="legend-item"><span className="legend-dot" style={{background:'var(--status-moving)'}}/>Moving</div>
        <div className="legend-item"><span className="legend-dot" style={{background:'var(--status-idle)'}}/>Idle</div>
        <div className="legend-item"><span className="legend-dot" style={{background:'var(--status-offline)'}}/>Offline</div>
      </div>
      <div className="legend-grp">
        <div className="legend-grp-label">Visit status</div>
        <div className="legend-item"><span className="legend-dot" style={{background:'var(--status-pending)'}}/>Pending</div>
        <div className="legend-item"><span className="legend-dot" style={{background:'var(--status-arrived)'}}/>Arrived</div>
        <div className="legend-item"><span className="legend-dot" style={{background:'var(--status-moving)'}}/>Completed</div>
      </div>
    </div>
  );
}

function VehiclePins() {
  return (
    <>
      {DRIVERS.map(d => (
        <div
          key={d.id}
          className={`pin ${d.status} ${d.selected ? 'selected' : ''}`}
          style={{ left: `${d.pin.x}%`, top: `${d.pin.y}%` }}
          title={`${d.name} · ${d.plate}`}
        >
          {d.status === 'moving' && <span className="pulse" />}
          {d.initials}
        </div>
      ))}
    </>
  );
}

// ── ⌘K Command palette ──────────────────────────────────

function CmdKPalette() {
  return (
    <div className="cmdk-overlay">
      <div className="cmdk">
        <div className="cmdk-input">
          {Ic.search}
          <span className="query">ana<span className="cursor" /></span>
          <span className="kbd">esc</span>
        </div>
        <div className="cmdk-list">
          <div className="cmdk-group">Drivers</div>
          <div className="cmdk-item active">
            {Ic.users}<span>Ana Torres</span><span className="sub mono">JKL-012 · Sopocachi Route</span>
            <span className="kbd ksh">↵</span>
          </div>
          <div className="cmdk-item">
            {Ic.users}<span>Diana Mamani</span><span className="sub mono">RST-204 · Idle</span>
          </div>
          <div className="cmdk-group">Actions</div>
          <div className="cmdk-item">
            {Ic.plus}<span>Create new route</span>
            <span className="kbd ksh">⌘ R</span>
          </div>
          <div className="cmdk-item">
            {Ic.userPlus}<span>Assign driver to route</span>
            <span className="kbd ksh">⌘ A</span>
          </div>
          <div className="cmdk-item">
            {Ic.navi}<span>Focus on Ana Torres on map</span>
            <span className="kbd ksh">F</span>
          </div>
          <div className="cmdk-group">Navigate</div>
          <div className="cmdk-item">
            {Ic.history}<span>Open History</span>
            <span className="sub">G then H</span>
          </div>
          <div className="cmdk-item">
            {Ic.activity}<span>Open Monitoring</span>
            <span className="sub">G then M</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Footer with keyboard hints ──────────────────────────

function Footer() {
  return (
    <footer className="foot">
      <span className="grp"><span className="kbd">↑↓</span><span>navigate</span></span>
      <span className="sep"/>
      <span className="grp"><span className="kbd">↵</span><span>open driver</span></span>
      <span className="sep"/>
      <span className="grp"><span className="kbd">F</span><span>focus on map</span></span>
      <span className="sep"/>
      <span className="grp"><span className="kbd">N</span><span>new route</span></span>
      <span className="sep"/>
      <span className="grp"><span className="kbd">⌘ K</span><span>commands</span></span>
      <span className="sep"/>
      <span className="grp"><span className="kbd">⌘ /</span><span>all shortcuts</span></span>
      <span className="live">
        <span className="live-dot" />
        <span>Connected · La Paz, Bolivia</span>
      </span>
    </footer>
  );
}

// ── Driver detail card (variation B) ────────────────────

function DriverDetail({ d }) {
  return (
    <div className="detail-card">
      <div className="detail-head">
        <span className="detail-av">{d.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="detail-name">{d.name}</div>
          <div className="detail-sub">{d.plate} · {d.route}</div>
        </div>
        <button className="hdr-icon-btn">{Ic.chevR}</button>
      </div>
      <div className="detail-body">
        <div>
          <div className="detail-stat-label">Speed</div>
          <div className="detail-stat-value">{d.speed} <span style={{color:'var(--text-dim)', fontSize: 11}}>km/h</span></div>
        </div>
        <div>
          <div className="detail-stat-label">Distance</div>
          <div className="detail-stat-value">{d.distance.toFixed(1)} <span style={{color:'var(--text-dim)', fontSize: 11}}>km</span></div>
        </div>
        <div>
          <div className="detail-stat-label">Last update</div>
          <div className="detail-stat-value" style={{fontSize: 12}}>{d.lastUpdate}</div>
        </div>
        <div>
          <div className="detail-stat-label">Visit</div>
          <div className="detail-stat-value">{d.progress}/{d.total}</div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="detail-stat-label" style={{ marginBottom: 5 }}>Route progress</div>
          <ProgressBar done={d.progress} total={d.total} />
        </div>
      </div>
      <div className="detail-foot">
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn flex">{Ic.eye}<span>View</span></button>
          <button className="btn flex">{Ic.route}<span>Route</span></button>
          <button className="btn flex">{Ic.phone}<span>Call</span></button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard variations ────────────────────────────────

function DashboardA({ theme = 'dark', sidebarSide = 'left', showGrid = true, showCmdK = true }) {
  return (
    <div className={`app theme-${theme}`}>
      <Header active="live" />
      <div className="body">
        {sidebarSide === 'left' && <FleetSidebar side="left" />}
        <main className="main">
          <div className="map-wrap">
            <PseudoMap />
            {showGrid && <div className="map-grid-overlay" />}
            <MapLabels variation="A" />
            <StatStrip items={STAT_ITEMS} floating />
            <MapControls side={sidebarSide === 'left' ? 'right' : 'left'} />
            <MapLegend />
            <VehiclePins />
            {showCmdK && <CmdKPalette />}
          </div>
        </main>
        {sidebarSide === 'right' && <FleetSidebar side="right" />}
      </div>
      <Footer />
    </div>
  );
}

function DashboardB({ theme = 'light', sidebarSide = 'right', showGrid = true }) {
  const selected = DRIVERS.find(d => d.selected) || DRIVERS[3];
  return (
    <div className={`app theme-${theme}`}>
      <Header active="live" />
      <StatRow items={STAT_ITEMS} />
      <div className="body">
        {sidebarSide === 'left' && <FleetSidebar side="left" />}
        <main className="main">
          <div className="map-wrap">
            <PseudoMap />
            {showGrid && <div className="map-grid-overlay" />}
            <MapLabels variation="B" />
            <MapControls side={sidebarSide === 'left' ? 'right' : 'left'} />
            <MapLegend />
            <VehiclePins />
            <DriverDetail d={selected} />
          </div>
        </main>
        {sidebarSide === 'right' && <FleetSidebar side="right" />}
      </div>
      <Footer />
    </div>
  );
}

Object.assign(window, { DashboardA, DashboardB });
