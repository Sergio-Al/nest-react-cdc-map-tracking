import { Fuel, ShieldCheck } from 'lucide-react';

const CONFIG = {
  fuel: {
    Icon: Fuel,
    title: 'Fuel reports',
    body: 'Consumption, cost-per-km and refuel logs will appear here once fuel telemetry is wired into the pipeline.',
  },
  safety: {
    Icon: ShieldCheck,
    title: 'Safety reports',
    body: 'Harsh-braking, speeding and idling scorecards will appear here once safety events are captured.',
  },
} as const;

export function ComingSoon({ kind }: { kind: 'fuel' | 'safety' }) {
  const { Icon, title, body } = CONFIG[kind];
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex max-w-[480px] flex-col items-center gap-3 rounded-xl border border-dashed border-mc-border-strong bg-mc-elev p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-[14px] border border-border bg-mc-surface text-mc-text-dim">
          <Icon className="h-[22px] w-[22px]" />
        </div>
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</div>
        <div className="max-w-[360px] text-xs leading-relaxed text-mc-text-muted">{body}</div>
        <span className="mt-1 rounded-full border border-border bg-mc-surface px-2.5 py-0.5 font-mono text-[10.5px] text-mc-text-dim">
          coming soon
        </span>
      </div>
    </div>
  );
}
