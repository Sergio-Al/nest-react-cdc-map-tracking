import { Fuel, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ICONS = {
  fuel: Fuel,
  safety: ShieldCheck,
} as const;

export function ComingSoon({ kind }: { kind: 'fuel' | 'safety' }) {
  const { t } = useTranslation('reports');
  const Icon = ICONS[kind];
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex max-w-[480px] flex-col items-center gap-3 rounded-xl border border-dashed border-mc-border-strong bg-mc-elev p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-border bg-mc-surface text-mc-text-dim">
          <Icon className="h-[22px] w-[22px]" />
        </div>
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {t(`comingSoon.${kind}.title`)}
        </div>
        <div className="max-w-[360px] text-xs leading-relaxed text-mc-text-muted">
          {t(`comingSoon.${kind}.body`)}
        </div>
        <span className="mt-1 rounded-full border border-border bg-mc-surface px-2.5 py-0.5 font-mono text-[10.5px] text-mc-text-dim">
          {t('comingSoon.badge')}
        </span>
      </div>
    </div>
  );
}
