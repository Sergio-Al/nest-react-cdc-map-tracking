// PseudoMap — fake but map-like SVG city background.
// La Paz–ish: grid streets, diagonal avenue, park, river, neighborhoods.

function PseudoMap({ showGrid = true, theme = 'dark' }) {
  // Convert percentages to viewBox-space (1600x900)
  const W = 1600, H = 900;

  return (
    <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* base */}
      <rect x="0" y="0" width={W} height={H} fill="var(--map-bg)"/>

      {/* faint dot field (Linear-ish) */}
      <defs>
        <pattern id="dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="var(--map-grid)" />
        </pattern>
        <pattern id="blocks" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          <rect x="6" y="6" width="48" height="48" rx="3" fill="var(--map-block)" />
          <rect x="64" y="6" width="48" height="48" rx="3" fill="var(--map-block)" />
          <rect x="6" y="64" width="48" height="48" rx="3" fill="var(--map-block)" />
          <rect x="64" y="64" width="48" height="48" rx="3" fill="var(--map-block)" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={W} height={H} fill="url(#dots)" opacity="0.6"/>

      {/* big city blocks via pattern */}
      <rect x="0" y="0" width={W} height={H} fill="url(#blocks)" opacity="0.55"/>

      {/* River (curved) */}
      <path d="M -50 720 C 200 680, 380 760, 560 700 S 920 600, 1100 660 S 1450 720, 1700 660 L 1700 900 L -50 900 Z"
            fill="var(--map-water)" opacity="0.7"/>
      <path d="M -50 720 C 200 680, 380 760, 560 700 S 920 600, 1100 660 S 1450 720, 1700 660"
            stroke="var(--map-water)" strokeWidth="1.5" fill="none" opacity="0.9"/>

      {/* Park (irregular green) */}
      <path d="M 980 130 L 1180 110 L 1240 200 L 1210 290 L 1080 310 L 990 240 Z"
            fill="var(--map-park)" />

      {/* Plaza circles */}
      <circle cx="780" cy="450" r="60" fill="var(--map-park)" opacity="0.55" />
      <circle cx="380" cy="380" r="38" fill="var(--map-park)" opacity="0.45" />

      {/* Main horizontal arteries */}
      <line x1="0" y1="220" x2={W} y2="220" stroke="var(--map-road)" strokeWidth="5" />
      <line x1="0" y1="520" x2={W} y2="520" stroke="var(--map-road)" strokeWidth="5" />
      <line x1="0" y1="380" x2={W} y2="380" stroke="var(--map-road)" strokeWidth="3.5" />
      <line x1="0" y1="640" x2={W} y2="640" stroke="var(--map-road)" strokeWidth="3.5" />

      {/* Vertical arteries */}
      <line x1="280"  y1="0" x2="280"  y2={H} stroke="var(--map-road)" strokeWidth="4"/>
      <line x1="620"  y1="0" x2="620"  y2={H} stroke="var(--map-road)" strokeWidth="4"/>
      <line x1="960"  y1="0" x2="960"  y2={H} stroke="var(--map-road)" strokeWidth="3.5"/>
      <line x1="1280" y1="0" x2="1280" y2={H} stroke="var(--map-road)" strokeWidth="4"/>

      {/* Soft secondary streets */}
      {[80, 160, 300, 460, 580, 760, 820].map(y => (
        <line key={'h'+y} x1="0" y1={y} x2={W} y2={y} stroke="var(--map-road-soft)" strokeWidth="1.2" />
      ))}
      {[140, 380, 520, 760, 880, 1080, 1180, 1400, 1500].map(x => (
        <line key={'v'+x} x1={x} y1="0" x2={x} y2={H} stroke="var(--map-road-soft)" strokeWidth="1.2" />
      ))}

      {/* Diagonal avenue (Av. Arce style) */}
      <line x1="0" y1="900" x2="1600" y2="40" stroke="var(--map-road)" strokeWidth="3.5" opacity="0.55"/>
      <line x1="0" y1="900" x2="1600" y2="40" stroke="var(--map-road-soft)" strokeWidth="9" opacity="0.18"/>

      {/* Highway curve */}
      <path d="M 1300 0 C 1320 200, 1100 320, 1150 500 S 1400 700, 1450 900" stroke="var(--map-road)" strokeWidth="3" fill="none" opacity="0.6"/>
    </svg>
  );
}

function MapLabels({ variation = 'A' }) {
  // Place labels reflect La Paz / fleet domain. Positioned in %.
  const labels = [
    { x: 8,  y: 22,  text: 'AV · CIUDAD SATÉLITE' },
    { x: 38, y: 12,  text: 'ZONA NORTE' },
    { x: 70, y: 16,  text: 'PARQUE URBANO CENTRAL' },
    { x: 18, y: 56,  text: 'PLAZA MURILLO' },
    { x: 53, y: 51,  text: 'AV. ARCE' },
    { x: 76, y: 46,  text: 'SOPOCACHI' },
    { x: 42, y: 74,  text: 'CALACOTO' },
    { x: 78, y: 78,  text: 'OBRAJES' },
    { x: 6,  y: 84,  text: 'RÍO CHOQUEYAPU' },
  ];
  return (
    <>
      {labels.map((l, i) => (
        <div key={i} className="map-label" style={{ left: `${l.x}%`, top: `${l.y}%` }}>
          {l.text}
        </div>
      ))}
    </>
  );
}

Object.assign(window, { PseudoMap, MapLabels });
