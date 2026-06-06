import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "@/hooks/api/useOnboarding";
import { useDashboardStore } from "@/stores/dashboard.store";
import "./welcome.css";

/**
 * FleetTrack first-run welcome modal.
 *
 * Ported from the Mission Control Pro design handoff (onboarding/Welcome.html):
 * a welcome screen listing the marquee features, followed by 6 feature
 * spotlights, paginated with dots, Back/Continue, keyboard nav, dismissable
 * and replayable. Styling lives in welcome.css (scoped under `.ftw`, mapped
 * onto the app's --mc-* theme tokens so it follows light/dark). Copy is
 * translated via the `onboarding` i18n namespace (es default + en).
 *
 * Shows automatically the first time a signed-in user lands in the app. The
 * acknowledgement is persisted per-user in the backend (item key below) so it
 * follows the user across browsers/devices and survives a cache clear.
 */

const ITEM_KEY = "welcome_v1";
const TOTAL = 7; // 0 welcome + 6 spotlights
const SPOTS = TOTAL - 1; // dots represent spotlights 1..6

export function WelcomeOnboarding() {
  const { t } = useTranslation("onboarding");
  const { isLoading, acknowledged, step, ack, setStep } = useOnboarding(ITEM_KEY);
  const welcomeReplay = useDashboardStore((s) => s.welcomeReplay);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState(-1);
  const gated = useRef(false);

  // First-run gate: open once the server confirms the user hasn't seen it.
  // Resume at the last persisted step. Server is the source of truth — there
  // is no localStorage fallback (existing users are re-shown once).
  useEffect(() => {
    if (isLoading || gated.current) return;
    gated.current = true;
    if (!acknowledged) {
      if (step != null) setIdx(Math.max(0, Math.min(TOTAL - 1, step)));
      setOpen(true);
    }
  }, [isLoading, acknowledged, step]);

  // On-demand replay (Settings / command palette): force-open from the start,
  // regardless of the server "seen" state. Skips the initial mount (nonce 0).
  useEffect(() => {
    if (welcomeReplay === 0) return;
    setPrev(-1);
    setIdx(0);
    setOpen(true);
  }, [welcomeReplay]);

  // Persist the resume point as the user advances (skip the initial render so
  // we don't write back the step we just restored). Status stays 'pending'.
  const firstStep = useRef(true);
  useEffect(() => {
    if (!open) return;
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    setStep(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx]);

  const go = useCallback((n: number) => {
    setIdx((cur) => {
      setPrev(cur);
      return Math.max(0, Math.min(TOTAL - 1, n));
    });
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    ack({ status: "completed", step: idx });
  }, [idx, ack]);

  const next = useCallback(() => {
    if (idx >= TOTAL - 1) dismiss();
    else go(idx + 1);
  }, [idx, go, dismiss]);

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (idx < TOTAL - 1) go(idx + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (idx > 0) go(idx - 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      } else if (e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, idx, go, dismiss, next]);

  const panelClass = (i: number) => {
    let c = "panel";
    if (i === idx) c += " active";
    if (i === prev && prev < idx) c += " leaving-left";
    return c;
  };

  const nextLabel =
    idx === 0 ? t("getStarted") : idx === TOTAL - 1 ? t("enter") : t("continue");

  return (
    <div className="ftw">
      {open && (
        <div className="scrim" id="scrim">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${t("welcome.eyebrow")} ${t("welcome.title")}`}
          >
            <button className="modal-close" aria-label={t("close")} onClick={dismiss}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="panels">
              {/* 0 · Welcome */}
              <section className={panelClass(0)} data-panel="0">
                <div className="w-icon">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M3 7l5-3 8 4 5-3v13l-5 3-8-4-5 3V7z" stroke="oklch(0.99 0 0)" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="w-eyebrow">{t("welcome.eyebrow")}</p>
                <h1 className="w-title">{t("welcome.title")}</h1>
                <p className="w-sub">{t("welcome.subtitle")}</p>
                <div className="w-list">
                  <div className="w-row">
                    <span className="chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                    </span>
                    <div><div className="rt">{t("welcome.features.map.title")}</div><div className="rd">{t("welcome.features.map.desc")}</div></div>
                  </div>
                  <div className="w-row">
                    <span className="chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                    </span>
                    <div><div className="rt">{t("welcome.features.visits.title")}</div><div className="rd">{t("welcome.features.visits.desc")}</div></div>
                  </div>
                  <div className="w-row">
                    <span className="chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>
                    </span>
                    <div><div className="rt">{t("welcome.features.routes.title")}</div><div className="rd">{t("welcome.features.routes.desc")}</div></div>
                  </div>
                  <div className="w-row">
                    <span className="chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></svg>
                    </span>
                    <div><div className="rt">{t("welcome.features.reports.title")}</div><div className="rd">{t("welcome.features.reports.desc")}</div></div>
                  </div>
                  <div className="w-row">
                    <span className="chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
                    </span>
                    <div><div className="rt">{t("welcome.features.history.title")}</div><div className="rd">{t("welcome.features.history.desc")}</div></div>
                  </div>
                  <div className="w-row">
                    <span className="chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                    </span>
                    <div><div className="rt">{t("welcome.features.billing.title")}</div><div className="rd">{t("welcome.features.billing.desc")}</div></div>
                  </div>
                </div>
              </section>

              {/* 1 · Live Fleet Map */}
              <section className={panelClass(1)} data-panel="1">
                <div className="spot-hero">
                  <div className="h-grid" />
                  <svg className="bd-route" viewBox="0 0 440 256" preserveAspectRatio="none" fill="none">
                    <path d="M40 200 C 120 190 130 90 220 96 S 360 70 410 60" stroke="oklch(0.72 0.16 50 / 0.45)" strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
                  </svg>
                  <div className="lm-pin" style={{ left: "9%", top: "78%", background: "var(--mc-status-moving)", color: "var(--mc-status-moving)" }}><span className="ring" /></div>
                  <div className="lm-pin" style={{ left: "50%", top: "37%", background: "var(--mc-status-moving)", color: "var(--mc-status-moving)" }}><span className="ring" /></div>
                  <div className="lm-pin" style={{ left: "30%", top: "24%", background: "var(--mc-status-idle)", color: "var(--mc-status-idle)" }} />
                  <div className="lm-card">
                    <div className="nm"><span className="av">JM</span> J. Mamani
                      <span className="pill ok" style={{ marginLeft: "auto", padding: "1px 7px" }}><span className="pd" />{t("spotlights.map.card.status")}</span>
                    </div>
                    <div className="meta"><span>{t("spotlights.map.card.speed")} <span className="v">42</span></span><span>·</span><span>{t("spotlights.map.card.eta")} <span className="v">7m</span></span><span>·</span><span>R-12</span></div>
                  </div>
                </div>
                <div className="spot-domain"><span className="gl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg></span>{t("spotlights.map.domain")}</div>
                <h2 className="spot-title">{t("spotlights.map.title")}</h2>
                <p className="spot-desc">{t("spotlights.map.desc")}</p>
              </section>

              {/* 2 · Planned Visits */}
              <section className={panelClass(2)} data-panel="2">
                <div className="spot-hero">
                  <div className="vl-track">
                    <div className="vl-flag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2C20 17.5 12 22 12 22Z" /><circle cx="12" cy="10" r="2.5" /></svg> {t("spotlights.visits.flag")}</div>
                    <div className="vl-line"><div className="fill" /></div>
                    <div className="vl-nodes">
                      <div className="vl-node"><span className="vl-dot done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span><span className="vl-label">{t("spotlights.visits.steps.pending")}</span></div>
                      <div className="vl-node"><span className="vl-dot arrived"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg></span><span className="vl-label">{t("spotlights.visits.steps.arrived")}</span></div>
                      <div className="vl-node"><span className="vl-dot active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><span className="vl-label cur">{t("spotlights.visits.steps.inProgress")}</span></div>
                      <div className="vl-node"><span className="vl-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span><span className="vl-label">{t("spotlights.visits.steps.completed")}</span></div>
                      <div className="vl-node"><span className="vl-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span><span className="vl-label">{t("spotlights.visits.steps.departed")}</span></div>
                    </div>
                  </div>
                </div>
                <div className="spot-domain"><span className="gl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg></span>{t("spotlights.visits.domain")}</div>
                <h2 className="spot-title">{t("spotlights.visits.title")}</h2>
                <p className="spot-desc">{t("spotlights.visits.desc")}</p>
              </section>

              {/* 3 · Route Optimization */}
              <section className={panelClass(3)} data-panel="3">
                <div className="spot-hero">
                  <div className="ro-save">{t("spotlights.routes.save")}</div>
                  <div className="ro-wrap">
                    <div className="ro-col">
                      <div className="ttl">{t("spotlights.routes.asPlanned")}</div>
                      <div className="ro-stop"><span className="ix">3</span> Sopocachi</div>
                      <div className="ro-stop"><span className="ix">1</span> Miraflores</div>
                      <div className="ro-stop"><span className="ix">4</span> Calacoto</div>
                      <div className="ro-stop"><span className="ix">2</span> San Pedro</div>
                      <div className="ro-dist bad">147<span className="u"> km</span></div>
                    </div>
                    <div className="ro-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></div>
                    <div className="ro-col after">
                      <div className="ttl">{t("spotlights.routes.optimized")}</div>
                      <div className="ro-stop"><span className="ix">1</span> Miraflores</div>
                      <div className="ro-stop"><span className="ix">2</span> San Pedro</div>
                      <div className="ro-stop"><span className="ix">3</span> Sopocachi</div>
                      <div className="ro-stop"><span className="ix">4</span> Calacoto</div>
                      <div className="ro-dist good">98<span className="u"> km</span></div>
                    </div>
                  </div>
                </div>
                <div className="spot-domain"><span className="gl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg></span>{t("spotlights.routes.domain")}</div>
                <h2 className="spot-title">{t("spotlights.routes.title")}</h2>
                <p className="spot-desc">{t("spotlights.routes.desc")}</p>
              </section>

              {/* 4 · Reports */}
              <section className={panelClass(4)} data-panel="4">
                <div className="spot-hero">
                  <div className="rp-pad">
                    <div className="rp-kpis">
                      <div className="rp-kpi"><div className="k">{t("spotlights.reports.kpis.onTime")}</div><div className="v">94<span className="u">%</span></div></div>
                      <div className="rp-kpi"><div className="k">{t("spotlights.reports.kpis.visits")}</div><div className="v">1,284</div></div>
                      <div className="rp-kpi"><div className="k">{t("spotlights.reports.kpis.avgStop")}</div><div className="v">11<span className="u">m</span></div></div>
                    </div>
                    <div className="rp-chart">
                      <div className="rp-bar mut" style={{ height: "38%" }} />
                      <div className="rp-bar mut" style={{ height: "54%" }} />
                      <div className="rp-bar mut" style={{ height: "47%" }} />
                      <div className="rp-bar" style={{ height: "78%" }} />
                      <div className="rp-bar mut" style={{ height: "62%" }} />
                      <div className="rp-bar mut" style={{ height: "71%" }} />
                      <div className="rp-bar mut" style={{ height: "50%" }} />
                    </div>
                    <div className="rp-axis"><span>{t("spotlights.reports.days.mon")}</span><span>{t("spotlights.reports.days.tue")}</span><span>{t("spotlights.reports.days.wed")}</span><span>{t("spotlights.reports.days.thu")}</span><span>{t("spotlights.reports.days.fri")}</span><span>{t("spotlights.reports.days.sat")}</span><span>{t("spotlights.reports.days.sun")}</span></div>
                  </div>
                </div>
                <div className="spot-domain"><span className="gl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></svg></span>{t("spotlights.reports.domain")}</div>
                <h2 className="spot-title">{t("spotlights.reports.title")}</h2>
                <p className="spot-desc">{t("spotlights.reports.desc")}</p>
              </section>

              {/* 5 · History & Playback */}
              <section className={panelClass(5)} data-panel="5">
                <div className="spot-hero">
                  <div className="hp-pad">
                    <div className="hp-map">
                      <div className="h-grid" style={{ maskImage: "radial-gradient(140% 120% at 40% 50%, #000 50%, transparent 100%)", WebkitMaskImage: "radial-gradient(140% 120% at 40% 50%, #000 50%, transparent 100%)" }} />
                      <svg className="bd-route" viewBox="0 0 400 150" preserveAspectRatio="none" fill="none">
                        <path d="M20 120 C 90 110 110 40 180 50 S 300 90 360 30" stroke="var(--mc-accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
                        <path d="M180 50 C 240 64 290 60 360 30" stroke="var(--mc-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" opacity="0.9" />
                      </svg>
                      <div className="hp-evt" style={{ left: "5%", top: "80%", background: "var(--mc-status-arrived)" }} />
                      <div className="hp-evt" style={{ left: "45%", top: "33%", background: "var(--mc-status-moving)" }} />
                      <div className="hp-head" style={{ left: "45%", top: "33%" }} />
                    </div>
                    <div className="hp-bar">
                      <span className="hp-play"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg></span>
                      <div className="hp-scrub">
                        <div className="pf" />
                        <div className="tick" style={{ left: "12%" }} />
                        <div className="tick" style={{ left: "30%" }} />
                        <div className="tick" style={{ left: "68%" }} />
                        <div className="ph" />
                      </div>
                      <span className="hp-time">09:42</span>
                    </div>
                  </div>
                </div>
                <div className="spot-domain"><span className="gl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg></span>{t("spotlights.history.domain")}</div>
                <h2 className="spot-title">{t("spotlights.history.title")}</h2>
                <p className="spot-desc">{t("spotlights.history.desc")}</p>
              </section>

              {/* 6 · Onboarding & Billing */}
              <section className={panelClass(6)} data-panel="6">
                <div className="spot-hero">
                  <div className="bl-pad">
                    <div className="bl-trial">
                      <span className="cd">12</span>
                      <span className="cl"><span><b>{t("spotlights.billing.trialDays")}</b> {t("spotlights.billing.trialIn")}</span><span className="sub">{t("spotlights.billing.trialNoCard")}</span></span>
                    </div>
                    <div className="bl-seats">
                      <div className="row"><span className="k">{t("spotlights.billing.seatsLabel")}</span><span className="v">2 / 3</span></div>
                      <div className="bl-track"><div className="f" /></div>
                    </div>
                    <div className="bl-plans">
                      <div className="bl-plan"><div className="pn">{t("spotlights.billing.plans.starter.name")}</div><div className="pp">{t("spotlights.billing.plans.starter.tag")}</div></div>
                      <div className="bl-plan on"><div className="pn">{t("spotlights.billing.plans.growth.name")}</div><div className="pp">{t("spotlights.billing.plans.growth.tag")}</div></div>
                      <div className="bl-plan"><div className="pn">{t("spotlights.billing.plans.business.name")}</div><div className="pp">{t("spotlights.billing.plans.business.tag")}</div></div>
                    </div>
                  </div>
                </div>
                <div className="spot-domain"><span className="gl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></span>{t("spotlights.billing.domain")}</div>
                <h2 className="spot-title">{t("spotlights.billing.title")}</h2>
                <p className="spot-desc">{t("spotlights.billing.desc")}</p>
              </section>
            </div>

            {/* Footer */}
            <div className="modal-foot">
              {idx === 0 && (
                <button className="skip" onClick={dismiss}>{t("skip")}</button>
              )}
              {idx !== 0 && (
                <div className="dots">
                  {Array.from({ length: SPOTS }, (_, i) => {
                    const step = i + 1;
                    let c = "dot";
                    if (step === idx) c += " on";
                    else if (step < idx) c += " done";
                    return (
                      <button
                        key={i}
                        className={c}
                        aria-label={t("dotLabel", { step })}
                        onClick={() => go(step)}
                      />
                    );
                  })}
                </div>
              )}
              <div className="foot-spacer" />
              <button className={`btn ghost btn-back${idx === 0 ? " hidden" : ""}`} onClick={() => go(idx - 1)}>{t("back")}</button>
              <button className="btn primary" onClick={next}>{nextLabel}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
