import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import {
  useSettings, useUpdateUserSettings, useTenantSettings, useUpdateTenantSettings,
} from '@/hooks/api/useSettings';
import type { TenantSettingsPatch } from '@/hooks/api/useSettings';
import type { EffectiveSettings } from '@/types/auth.types';

const DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];
const PRESETS = ['today', 'yesterday', '7d', '14d', '30d', 'mtd', 'qtd', 'ytd'];

/** Curated timezones — full IANA list when the runtime supports it. */
function useTimezones(current: string): string[] {
  return useMemo(() => {
    const fallback = [
      'America/La_Paz', 'America/Lima', 'America/Bogota', 'America/Argentina/Buenos_Aires',
      'America/Sao_Paulo', 'America/Mexico_City', 'America/New_York', 'America/Los_Angeles',
      'Europe/Madrid', 'Europe/London', 'UTC',
    ];
    let list = fallback;
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof sv === 'function') {
      try { list = sv('timeZone'); } catch { /* keep fallback */ }
    }
    return list.includes(current) ? list : [current, ...list];
  }, [current]);
}

// ── atoms ───────────────────────────────────────────────────
function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-mc-border bg-mc-elev [&+&]:mt-4">
      <div className="border-b border-mc-border px-[18px] pb-3.5 pt-4">
        <div className="text-sm font-semibold tracking-[-0.01em]">{title}</div>
        <div className="mt-[3px] text-[12.5px] text-mc-text-muted">{desc}</div>
      </div>
      <div className="px-[18px] pb-2 pt-1.5">{children}</div>
    </section>
  );
}

function Frow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,300px)] items-center gap-4 border-b border-mc-border/50 py-[13px] last:border-b-0">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {help && <div className="mt-0.5 text-xs text-mc-text-dim">{help}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full cursor-pointer appearance-none rounded-[7px] border border-mc-border bg-background pl-[11px] pr-[30px] text-[13px] font-medium tracking-[-0.005em] text-mc-text transition-colors hover:border-mc-border-strong focus:border-mc-accent-border focus:outline-none focus:ring-[3px] focus:ring-mc-accent-soft"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-mc-text-dim" />
    </div>
  );
}

function Segmented({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex w-full gap-0.5 rounded-lg border border-mc-border bg-mc-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-[26px] flex-1 rounded-md text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-mc-elev text-mc-text shadow-[0_1px_2px_oklch(0_0_0_/_0.15)]'
              : 'text-mc-text-muted hover:text-mc-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation('settings');
  const settings = useAuthStore((s) => s.settings);
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';

  useSettings(); // ensure effective settings are fetched/fresh
  const updateUser = useUpdateUserSettings();
  const updateTenant = useUpdateTenantSettings();
  const { data: tenant } = useTenantSettings(isAdmin);

  // ── form state mirrors effective settings + tenant defaults ──
  const [form, setForm] = useState<EffectiveSettings | null>(settings);
  const [tForm, setTForm] = useState<TenantSettingsPatch>({});
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  useEffect(() => {
    if (tenant) setTForm({
      timezone: tenant.timezone, locale: tenant.locale, units: tenant.units,
      defaultReportPreset: tenant.defaultReportPreset, dateFormat: tenant.dateFormat,
      ingestMode: tenant.ingestMode ?? 'standalone',
      allowAppOrderCreate: tenant.allowAppOrderCreate ?? true,
    });
  }, [tenant]);

  const timezones = useTimezones(form?.timezone ?? 'America/La_Paz');

  if (!form) return null;
  const set = (patch: Partial<EffectiveSettings>) => setForm({ ...form, ...patch });
  const setT = (patch: TenantSettingsPatch) => setTForm({ ...tForm, ...patch });

  const userDirty = !!settings && (Object.keys(form) as (keyof EffectiveSettings)[])
    .some((k) => form[k] !== settings[k]);
  const tenantDirty = !!tenant && (
    tForm.timezone !== tenant.timezone || tForm.locale !== tenant.locale ||
    tForm.units !== tenant.units || tForm.defaultReportPreset !== tenant.defaultReportPreset ||
    tForm.ingestMode !== (tenant.ingestMode ?? 'standalone') ||
    tForm.allowAppOrderCreate !== (tenant.allowAppOrderCreate ?? true)
  );
  const dirty = userDirty || tenantDirty;

  const discard = () => {
    if (settings) setForm(settings);
    if (tenant) setTForm({
      timezone: tenant.timezone, locale: tenant.locale, units: tenant.units,
      defaultReportPreset: tenant.defaultReportPreset, dateFormat: tenant.dateFormat,
      ingestMode: tenant.ingestMode ?? 'standalone',
      allowAppOrderCreate: tenant.allowAppOrderCreate ?? true,
    });
  };

  const save = async () => {
    try {
      if (userDirty) await updateUser.mutateAsync({
        timezone: form.timezone, locale: form.locale, dateFormat: form.dateFormat,
        units: form.units, defaultReportPreset: form.defaultReportPreset,
        theme: form.theme, density: form.density,
      });
      if (tenantDirty) await updateTenant.mutateAsync(tForm);
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveError'));
    }
  };
  const saving = updateUser.isPending || updateTenant.isPending;

  return (
    <div className="flex h-full flex-col">
      {/* workspace head */}
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-mc-border bg-background px-4">
        <nav className="flex items-center gap-[7px] whitespace-nowrap text-[13px]">
          <span className="text-mc-text-muted">{t('crumb.workspace')}</span>
          <span className="text-mc-text-dim">/</span>
          <span className="font-medium text-mc-text">{t('title')}</span>
          <span className="ml-0.5 font-mono text-[11.5px] text-mc-text-muted">· {t('crumb.scope')}</span>
        </nav>
        <div className="flex-1" />
        <button className="flex h-7 w-60 items-center gap-2 rounded-lg border border-mc-border bg-mc-surface px-2.5 text-[12.5px] text-mc-text-dim transition-colors hover:border-mc-border-strong">
          <Search className="h-[13px] w-[13px]" />
          <span>{t('search')}</span>
          <kbd className="ml-auto rounded border border-mc-border bg-mc-elev px-[5px] py-px font-mono text-[10.5px] text-mc-text-muted">⌘K</kbd>
        </button>
      </header>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-8 pb-10 pt-[26px]">
          <div className="mb-[22px]">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">{t('title')}</h1>
            <p className="mt-1 text-[13px] text-mc-text-muted">{t('subtitle')}</p>
          </div>

          {/* Localization */}
          <Card title={t('localization')} desc={t('inheritHint')}>
            <Frow label={t('fields.timezone')}>
              <SettingsSelect value={form.timezone} onChange={(v) => set({ timezone: v })}
                options={timezones.map((tz) => ({ value: tz, label: tz }))} />
            </Frow>
            <Frow label={t('fields.language')}>
              <SettingsSelect value={form.locale} onChange={(v) => set({ locale: v })}
                options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
            </Frow>
            <Frow label={t('fields.dateFormat')}>
              <SettingsSelect value={form.dateFormat} onChange={(v) => set({ dateFormat: v })}
                options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} />
            </Frow>
            <Frow label={t('fields.units')}>
              <SettingsSelect value={form.units} onChange={(v) => set({ units: v })}
                options={[{ value: 'metric', label: t('units.metric') }, { value: 'imperial', label: t('units.imperial') }]} />
            </Frow>
            <Frow label={t('fields.defaultRange')}>
              <SettingsSelect value={form.defaultReportPreset} onChange={(v) => set({ defaultReportPreset: v })}
                options={PRESETS.map((p) => ({ value: p, label: t(`presets.${p}`) }))} />
            </Frow>
          </Card>

          {/* Appearance */}
          <Card title={t('appearance')} desc={t('appearanceDesc')}>
            <Frow label={t('fields.theme')} help={t('themeHelp')}>
              <Segmented value={form.theme} onChange={(v) => set({ theme: v })}
                options={['light', 'dark', 'system'].map((x) => ({ value: x, label: t(`theme.${x}`) }))} />
            </Frow>
            <Frow label={t('fields.density')} help={t('densityHelp')}>
              <Segmented value={form.density} onChange={(v) => set({ density: v })}
                options={['compact', 'comfortable'].map((x) => ({ value: x, label: t(`density.${x}`) }))} />
            </Frow>
          </Card>

          {/* Tenant defaults (admin only) */}
          {isAdmin && (
            <Card title={t('tenantDefaults')} desc={t('tenantDefaultsHint')}>
              <Frow label={t('fields.timezone')}>
                <SettingsSelect value={tForm.timezone ?? ''} onChange={(v) => setT({ timezone: v })}
                  options={timezones.map((tz) => ({ value: tz, label: tz }))} />
              </Frow>
              <Frow label={t('fields.language')}>
                <SettingsSelect value={tForm.locale ?? 'es'} onChange={(v) => setT({ locale: v })}
                  options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
              </Frow>
              <Frow label={t('fields.units')}>
                <SettingsSelect value={tForm.units ?? 'metric'} onChange={(v) => setT({ units: v })}
                  options={[{ value: 'metric', label: t('units.metric') }, { value: 'imperial', label: t('units.imperial') }]} />
              </Frow>
              <Frow label={t('fields.ingestMode')} help={t('help.ingestMode')}>
                <Segmented
                  value={tForm.ingestMode ?? 'standalone'}
                  onChange={(v) => setT({ ingestMode: v })}
                  options={[
                    { value: 'standalone', label: t('ingestMode.standalone') },
                    { value: 'integrated', label: t('ingestMode.integrated') },
                  ]}
                />
              </Frow>
              <Frow label={t('fields.allowAppOrderCreate')} help={t('help.allowAppOrderCreate')}>
                <Segmented
                  value={String(tForm.allowAppOrderCreate ?? true)}
                  onChange={(v) => setT({ allowAppOrderCreate: v === 'true' })}
                  options={[
                    { value: 'true', label: 'On' },
                    { value: 'false', label: 'Off' },
                  ]}
                />
              </Frow>
            </Card>
          )}

          {/* Sticky save bar */}
          {dirty && (
            <div className="sticky bottom-0 -mx-8 mt-5 flex items-center gap-3 border-t border-mc-border bg-mc-bg/85 px-8 py-3.5 backdrop-blur-md">
              <span className="text-xs text-mc-text-dim">{t('savebar.unsaved')}</span>
              <div className="flex-1" />
              <button onClick={discard} disabled={saving}
                className="inline-flex h-7 items-center rounded-[7px] px-[11px] text-xs font-medium text-mc-text-muted transition-colors hover:bg-mc-surface hover:text-mc-text">
                {t('savebar.discard')}
              </button>
              <button onClick={save} disabled={saving}
                className="inline-flex h-7 items-center rounded-[7px] border border-mc-accent-strong bg-mc-accent px-[11px] text-xs font-medium text-mc-accent-fg shadow-[inset_0_1px_0_oklch(1_0_0_/_0.3)] transition-colors hover:bg-mc-accent-strong disabled:opacity-60">
                {t('save')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* footer */}
      <footer className="flex h-[30px] shrink-0 items-center gap-3.5 border-t border-mc-border bg-background px-4 text-[11px] text-mc-text-dim">
        <span className="flex items-center gap-1.5"><Kbd>⌘ K</Kbd> {t('footer.commands')}</span>
        <span className="h-3 w-px bg-mc-border" />
        <span className="flex items-center gap-1.5"><Kbd>⌘ ,</Kbd> {t('footer.settings')}</span>
        <span className="h-3 w-px bg-mc-border" />
        <span className="flex items-center gap-1.5"><Kbd>⌘ /</Kbd> {t('footer.shortcuts')}</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-mc-text-muted">
          <span className="h-1.5 w-1.5 animate-livepulse rounded-full bg-status-moving" />
          {t('footer.connected')}
        </span>
      </footer>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-mc-border bg-mc-elev px-[5px] py-px font-mono text-[10.5px] tracking-[0.02em] text-mc-text-muted">
      {children}
    </kbd>
  );
}
