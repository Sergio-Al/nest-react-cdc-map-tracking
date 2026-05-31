// App — DesignCanvas + tweaks panel, hosting both dashboard variations.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "themeA": "dark",
  "themeB": "light",
  "themeC": "c",
  "sidebarA": "left",
  "sidebarB": "right",
  "showGrid": true,
  "showCmdK": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  return (
    <>
      <DesignCanvas>
        <DCSection
          id="dashboards"
          title="FleetTrack · Live Operations"
          subtitle="Linear-inspired redesign of the main page · 3 layout variations"
        >
          <DCArtboard
            id="dash-a"
            label="A · Operations  ·  sidebar-left  ·  ⌘K open"
            width={1440}
            height={900}
          >
            <DashboardA
              theme={t.themeA}
              sidebarSide={t.sidebarA}
              showGrid={t.showGrid}
              showCmdK={t.showCmdK}
            />
          </DCArtboard>

          <DCArtboard
            id="dash-b"
            label="B · Mission Control  ·  inline stats  ·  driver detail"
            width={1440}
            height={900}
          >
            <DashboardB
              theme={t.themeB}
              sidebarSide={t.sidebarB}
              showGrid={t.showGrid}
            />
          </DCArtboard>

          <DCArtboard
            id="dash-c"
            label="C · Mission Control Pro  ·  Intercom + Linear  ·  inbox + detail panel"
            width={1440}
            height={900}
          >
            <DashboardC
              theme={t.themeC}
              showGrid={t.showGrid}
            />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Variation A — Operations" />
        <TweakRadio
          label="Theme"
          value={t.themeA}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={(v) => setTweak('themeA', v)}
        />
        <TweakRadio
          label="Sidebar"
          value={t.sidebarA}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(v) => setTweak('sidebarA', v)}
        />
        <TweakToggle
          label="Command palette open"
          value={t.showCmdK}
          onChange={(v) => setTweak('showCmdK', v)}
        />

        <TweakSection label="Variation B — Mission Control" />
        <TweakRadio
          label="Theme"
          value={t.themeB}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={(v) => setTweak('themeB', v)}
        />
        <TweakRadio
          label="Sidebar"
          value={t.sidebarB}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(v) => setTweak('sidebarB', v)}
        />

        <TweakSection label="Variation C — Mission Control Pro" />
        <TweakSelect
          label="Theme"
          value={t.themeC}
          options={[
            { value: 'c', label: 'Warm dark (default)' },
            { value: 'dark', label: 'Cool dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={(v) => setTweak('themeC', v)}
        />

        <TweakSection label="All variations" />
        <TweakToggle
          label="Map grid overlay"
          value={t.showGrid}
          onChange={(v) => setTweak('showGrid', v)}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
