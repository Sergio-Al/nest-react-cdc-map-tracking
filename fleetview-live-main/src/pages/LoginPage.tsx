import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  Mail,
  Lock,
  Building2,
  Eye,
  EyeOff,
  AlertTriangle,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import type { LoginRequest } from '@/types/auth.types';
import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────
   Validation — maps to the real auth payload { email, password, tenantId }.
   The mock's "Workspace" field is the tenantId (no .fleettrack.app suffix).
   ────────────────────────────────────────────────────────── */
const loginSchema = z.object({
  tenantId: z.string().min(1, 'Workspace is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

/* A small pulsing "live" dot, reused in the eyebrow, chip and footer. */
function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full animate-livepulse', className)}
      style={{
        background: 'var(--mc-status-moving)',
        boxShadow: '0 0 0 3px oklch(0.72 0.16 150 / 0.2)',
      }}
    />
  );
}

/* ──────────────────────────────────────────────────────────
   Pseudo-map — ambient La Paz–style backdrop (SVG).
   Uses the shared --mc-map-* tokens so it follows the theme.
   ────────────────────────────────────────────────────────── */
function PseudoMap() {
  const W = 1600;
  const H = 1100;
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="login-dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="var(--mc-map-grid)" />
        </pattern>
        <pattern id="login-blocks" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          <rect x="6" y="6" width="48" height="48" rx="3" fill="var(--mc-map-block)" />
          <rect x="64" y="6" width="48" height="48" rx="3" fill="var(--mc-map-block)" />
          <rect x="6" y="64" width="48" height="48" rx="3" fill="var(--mc-map-block)" />
          <rect x="64" y="64" width="48" height="48" rx="3" fill="var(--mc-map-block)" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={W} height={H} fill="var(--mc-map-bg)" />
      <rect x="0" y="0" width={W} height={H} fill="url(#login-dots)" opacity="0.55" />
      <rect x="0" y="0" width={W} height={H} fill="url(#login-blocks)" opacity="0.45" />

      {/* River */}
      <path
        d="M -50 880 C 200 840, 380 920, 560 860 S 920 760, 1100 820 S 1450 880, 1700 820 L 1700 1100 L -50 1100 Z"
        fill="var(--mc-map-water)"
        opacity="0.6"
      />
      <path
        d="M -50 880 C 200 840, 380 920, 560 860 S 920 760, 1100 820 S 1450 880, 1700 820"
        stroke="var(--mc-map-water)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.9"
      />

      {/* Park */}
      <path d="M 980 180 L 1180 160 L 1240 250 L 1210 340 L 1080 360 L 990 290 Z" fill="var(--mc-map-park)" />

      {/* Plazas */}
      <circle cx="780" cy="500" r="58" fill="var(--mc-map-park)" opacity="0.55" />
      <circle cx="380" cy="430" r="38" fill="var(--mc-map-park)" opacity="0.45" />

      {/* Main arteries */}
      <line x1="0" y1="260" x2={W} y2="260" stroke="var(--mc-map-road)" strokeWidth="5" />
      <line x1="0" y1="580" x2={W} y2="580" stroke="var(--mc-map-road)" strokeWidth="5" />
      <line x1="0" y1="430" x2={W} y2="430" stroke="var(--mc-map-road)" strokeWidth="3.5" />
      <line x1="0" y1="740" x2={W} y2="740" stroke="var(--mc-map-road)" strokeWidth="3.5" />

      {/* Vertical arteries */}
      <line x1="280" y1="0" x2="280" y2={H} stroke="var(--mc-map-road)" strokeWidth="4" />
      <line x1="620" y1="0" x2="620" y2={H} stroke="var(--mc-map-road)" strokeWidth="4" />
      <line x1="960" y1="0" x2="960" y2={H} stroke="var(--mc-map-road)" strokeWidth="3.5" />
      <line x1="1280" y1="0" x2="1280" y2={H} stroke="var(--mc-map-road)" strokeWidth="4" />

      {/* Soft secondary streets */}
      {[100, 180, 340, 520, 660, 820, 920].map((y) => (
        <line key={`h${y}`} x1="0" y1={y} x2={W} y2={y} stroke="var(--mc-map-road-soft)" strokeWidth="1.2" />
      ))}
      {[140, 380, 520, 760, 880, 1080, 1180, 1400, 1500].map((x) => (
        <line key={`v${x}`} x1={x} y1="0" x2={x} y2={H} stroke="var(--mc-map-road-soft)" strokeWidth="1.2" />
      ))}

      {/* Diagonal avenue */}
      <line x1="0" y1="1080" x2="1600" y2="60" stroke="var(--mc-map-road)" strokeWidth="3.5" opacity="0.55" />
      <line x1="0" y1="1080" x2="1600" y2="60" stroke="var(--mc-map-road-soft)" strokeWidth="9" opacity="0.18" />

      {/* Highway curve */}
      <path
        d="M 1300 0 C 1320 240, 1100 380, 1150 580 S 1400 820, 1450 1100"
        stroke="var(--mc-map-road)"
        strokeWidth="3"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}

const MAP_LABELS = [
  { x: 14, y: 26, text: 'ZONA NORTE' },
  { x: 44, y: 50, text: 'AV. ARCE' },
  { x: 72, y: 70, text: 'CALACOTO' },
];

function MapLabels() {
  return (
    <>
      {MAP_LABELS.map((l) => (
        <div
          key={l.text}
          className="pointer-events-none absolute z-[2] font-mono text-[9.5px] font-medium uppercase tracking-[0.08em]"
          style={{ left: `${l.x}%`, top: `${l.y}%`, color: 'var(--mc-map-label)' }}
        >
          {l.text}
        </div>
      ))}
    </>
  );
}

/* ──────────────────────────────────────────────────────────
   Vehicle pins + dashed trail toward the selected pin.
   ────────────────────────────────────────────────────────── */
type Pin = { x: number; y: number; status: 'moving' | 'idle' | 'offline'; initials: string; selected?: boolean };

const PINS: Pin[] = [
  { x: 22, y: 38, status: 'moving', initials: 'JR' },
  { x: 42, y: 56, status: 'moving', initials: 'AM', selected: true },
  { x: 64, y: 33, status: 'idle', initials: 'CS' },
  { x: 78, y: 60, status: 'moving', initials: 'LV' },
  { x: 33, y: 72, status: 'offline', initials: 'PG' },
  { x: 56, y: 80, status: 'moving', initials: 'NT' },
  { x: 18, y: 55, status: 'idle', initials: 'EQ' },
];

const PIN_FILL: Record<Pin['status'], string> = {
  moving: 'oklch(0.6 0.16 150)',
  idle: 'oklch(0.68 0.16 70)',
  offline: 'oklch(0.58 0.18 25)',
};

/* Per-pin drift timing, mirroring the mock's p1–p4 variants. */
const DRIFT = [
  { animationDuration: '14s', animationDelay: '0s' },
  { animationDuration: '17s', animationDelay: '-3s' },
  { animationDuration: '12s', animationDelay: '-7s' },
  { animationDuration: '19s', animationDelay: '-5s' },
];

function Pins() {
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="animate-trail-dash"
          d="M 18 55 C 26 56, 30 50, 42 56"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="4 6"
          style={{ stroke: 'var(--mc-accent)', opacity: 0.55 }}
        />
      </svg>

      {PINS.map((p, i) => {
        const moving = p.status === 'moving';
        return (
          <div
            key={p.initials}
            className={cn(
              'absolute z-[2] grid place-items-center rounded-full font-mono text-[10px] font-bold',
              "h-7 w-7 -ml-3.5 -mt-3.5",
              moving && 'animate-drift',
            )}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              color: 'oklch(0.98 0 0)',
              background: PIN_FILL[p.status],
              border: '2px solid var(--mc-bg-elev)',
              boxShadow: p.selected
                ? '0 4px 14px oklch(0 0 0 / 0.4)'
                : '0 2px 8px oklch(0 0 0 / 0.3)',
              ...(p.selected ? { outline: '2px solid var(--mc-accent)', outlineOffset: '2px', zIndex: 3 } : {}),
              ...(moving ? DRIFT[i % 4] : {}),
            }}
          >
            {p.initials}
            {moving && (
              <span className="absolute -inset-1 animate-pinpulse rounded-full border-[1.5px] border-current" />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ──────────────────────────────────────────────────────────
   Floating "Now tracking" card — the single focal point on the map.
   ────────────────────────────────────────────────────────── */
function NowCard() {
  return (
    <div
      className="absolute z-[3] min-w-[240px] rounded-mc-lg border border-mc-border-strong bg-mc-elev px-3.5 py-3 shadow-mc-float"
      style={{ left: '42%', top: '56%', transform: 'translate(-50%, -100%) translateY(-22px)' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[11.5px] font-semibold"
          style={{
            background: 'oklch(0.72 0.16 150 / 0.2)',
            color: 'oklch(0.85 0.18 150)',
            border: '2px solid oklch(0.72 0.16 150)',
          }}
        >
          AM
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-mc-text">Ana Marquez</div>
          <div className="mt-px font-mono text-[11px] text-mc-text-dim">BOL · 4521-PCA</div>
        </div>
        <div className="text-right font-mono text-[14px] font-semibold text-mc-text">
          42<span className="ml-0.5 text-[10px] text-mc-text-dim">km/h</span>
        </div>
      </div>

      <div className="mt-2.5 grid h-1 grid-cols-10 gap-0.5" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[1px]"
            style={{
              background:
                i < 6
                  ? 'var(--mc-accent)'
                  : i === 6
                    ? 'color-mix(in oklch, var(--mc-accent) 45%, transparent)'
                    : 'var(--mc-surface-hi)',
            }}
          />
        ))}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10.5px] text-mc-text-dim">
        <span className="uppercase tracking-[0.04em]">Andes Foods · R-04</span>
        <span>6 / 10 stops</span>
      </div>
    </div>
  );
}

/* The right-hand ambient visual column. */
function Visual() {
  return (
    <div className="relative hidden min-w-0 flex-1 flex-col overflow-hidden bg-map-bg min-[1080px]:flex">
      <div className="absolute inset-0">
        <PseudoMap />

        {/* Faint overlay grid, masked toward the edges */}
        <div
          className="pointer-events-none absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--mc-map-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--mc-map-grid) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
            maskImage: 'radial-gradient(ellipse at center, oklch(0 0 0) 30%, oklch(0 0 0 / 0.4) 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, oklch(0 0 0) 30%, oklch(0 0 0 / 0.4) 100%)',
          }}
        />

        <MapLabels />
        <Pins />
        <NowCard />

        {/* Vignette keeps the chrome readable over the map */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 30% 40%, transparent 0%, var(--mc-bg) 100%), linear-gradient(to right, oklch(0 0 0 / 0.18) 0%, transparent 30%)',
          }}
        />
      </div>

      <div className="relative z-[3] flex items-center gap-2.5 p-[18px_22px]">
        <div className="inline-flex h-7 items-center gap-[7px] rounded-pill border border-mc-border-strong bg-mc-elev pl-2.5 pr-3 font-mono text-[11.5px] tracking-[0.01em] text-mc-text-muted shadow-mc-float">
          <LiveDot />
          <strong className="font-medium text-mc-text">Live</strong>
          <span className="text-mc-text-dim">·</span>
          <span>5 of 8 drivers moving</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Login form — the real, wired-up sign-in.
   ────────────────────────────────────────────────────────── */
function LoginForm() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenantId: '', email: '', password: '' },
  });

  const email = watch('email');

  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    try {
      setIsLoading(true);
      // zod infers all fields optional under this repo's strictNullChecks:false,
      // but the resolver has already validated they're present.
      await login(data as LoginRequest);
      toast.success('Welcome back!');
      navigate('/');
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string | string[] } } })?.response
        ?.data?.message;
      const message = apiMessage ?? 'Your email or password doesn’t match our records.';
      setAuthError(Array.isArray(message) ? message.join(' ') : message);
    } finally {
      setIsLoading(false);
    }
  };

  const fieldError = (name: keyof LoginFormData) => errors[name]?.message;
  const passwordInvalid = Boolean(authError || fieldError('password'));

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onInput={() => authError && setAuthError(null)}
      className="flex min-h-0 flex-1 flex-col justify-center px-12 min-[1080px]:px-20"
      noValidate
    >
      <div className="mb-4 inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mc-text-dim">
        <LiveDot />
        <span>Mission Control · v4.2</span>
      </div>

      <h1 className="mb-2 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-mc-text">
        Welcome back.
      </h1>
      <p className="mb-7 max-w-[360px] text-sm leading-relaxed text-mc-text-muted">
        Sign in to keep an eye on the fleet — drivers, routes, and live position updates, all in one place.
      </p>

      {authError && (
        <div
          role="alert"
          className="mb-[18px] flex items-start gap-2.5 rounded-mc border border-mc-error-border bg-mc-error-soft px-3 py-2.5"
        >
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" style={{ color: 'var(--mc-error)' }} />
          <div className="min-w-0 flex-1 text-[12.5px] leading-[1.45]">
            <div className="mb-0.5 font-medium" style={{ color: 'var(--mc-error)' }}>
              Couldn’t sign you in
            </div>
            <div className="text-mc-text-muted">
              {authError}
              {email ? (
                <>
                  {' '}
                  Check the credentials for <span className="font-mono text-mc-text">{email}</span> and try again.
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {/* Workspace → tenantId */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="tenantId" className="text-[11.5px] font-medium text-mc-text-muted">
              Workspace
            </label>
            <span className="font-mono text-[11.5px] text-mc-text-dim">Tenant ID</span>
          </div>
          <div
            className={cn(
              'flex h-10 items-stretch overflow-hidden rounded-mc border bg-mc-field-bg transition-colors',
              'hover:border-mc-border-strong focus-within:border-mc-accent-border focus-within:bg-mc-field-bg-focus',
              'focus-within:shadow-[0_0_0_3px_var(--mc-accent-soft)]',
              fieldError('tenantId') ? 'border-mc-error-border' : 'border-mc-border',
            )}
          >
            <span className="grid place-items-center pl-3 pr-2.5 text-mc-text-dim">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <input
              id="tenantId"
              type="text"
              placeholder="tenant-1"
              autoComplete="organization"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[13.5px] text-mc-text outline-none placeholder:text-mc-text-dim"
              {...register('tenantId')}
            />
          </div>
          {fieldError('tenantId') && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mc-error)' }}>
              <AlertTriangle className="h-[11px] w-[11px]" /> {fieldError('tenantId')}
            </span>
          )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[11.5px] font-medium text-mc-text-muted">
            Email
          </label>
          <div
            className={cn(
              'flex h-10 items-stretch overflow-hidden rounded-mc border bg-mc-field-bg transition-colors',
              'hover:border-mc-border-strong focus-within:border-mc-accent-border focus-within:bg-mc-field-bg-focus',
              'focus-within:shadow-[0_0_0_3px_var(--mc-accent-soft)]',
              fieldError('email') ? 'border-mc-error-border' : 'border-mc-border',
            )}
          >
            <span className="grid place-items-center pl-3 pr-2.5 text-mc-text-dim">
              <Mail className="h-3.5 w-3.5" />
            </span>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[13.5px] text-mc-text outline-none placeholder:text-mc-text-dim"
              {...register('email')}
            />
          </div>
          {fieldError('email') && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mc-error)' }}>
              <AlertTriangle className="h-[11px] w-[11px]" /> {fieldError('email')}
            </span>
          )}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="password" className="text-[11.5px] font-medium text-mc-text-muted">
              Password
            </label>
            <a
              href="#"
              className="font-mono text-[11.5px] text-mc-accent transition-colors hover:text-mc-accent-strong"
            >
              Forgot password?
            </a>
          </div>
          <div
            className={cn(
              'flex h-10 items-stretch overflow-hidden rounded-mc border bg-mc-field-bg transition-colors',
              'hover:border-mc-border-strong focus-within:bg-mc-field-bg-focus',
              passwordInvalid
                ? 'border-mc-error-border focus-within:border-mc-error focus-within:shadow-[0_0_0_3px_var(--mc-error-soft)]'
                : 'border-mc-border focus-within:border-mc-accent-border focus-within:shadow-[0_0_0_3px_var(--mc-accent-soft)]',
            )}
          >
            <span className="grid place-items-center pl-3 pr-2.5 text-mc-text-dim">
              <Lock className="h-3.5 w-3.5" />
            </span>
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[13.5px] text-mc-text outline-none placeholder:text-mc-text-dim"
              {...register('password')}
            />
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((v) => !v)}
              className="grid place-items-center px-3 text-mc-text-dim transition-colors hover:text-mc-text-muted"
            >
              {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          {fieldError('password') && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mc-error)' }}>
              <AlertTriangle className="h-[11px] w-[11px]" /> {fieldError('password')}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-[42px] w-full items-center justify-center gap-2 rounded-mc border border-mc-accent-strong bg-mc-accent text-[13.5px] font-semibold text-mc-accent-fg transition-[background,transform] duration-100 hover:bg-mc-accent-strong active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
          style={{ boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.25), 0 1px 2px oklch(0 0 0 / 0.15)' }}
        >
          <span>{isLoading ? 'Signing in…' : 'Sign in to mission control'}</span>
          {!isLoading && <ArrowRight className="h-3.5 w-3.5" />}
          <span className="ml-auto inline-flex items-center gap-[3px] font-mono text-[11px] font-medium tracking-[0.04em] opacity-70">
            <span className="inline-flex items-center rounded border border-mc-accent-strong/40 bg-black/10 px-1.5 py-px leading-[1.4]">
              ↵
            </span>
          </span>
        </button>

        <div className="text-center text-xs text-mc-text-muted">
          New to FleetTrack?{' '}
          <a
            href="#"
            className="border-b border-mc-border-strong pb-px font-medium text-mc-text transition-colors hover:border-mc-accent-border hover:text-mc-accent"
          >
            Request access
          </a>
        </div>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────
   Page shell — split screen + theme toggle + minimal footer.
   ────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="flex h-screen min-h-[720px] flex-col bg-mc text-mc-text">
      <div className="flex min-h-0 flex-1">
        {/* Form column */}
        <div className="relative flex w-full shrink-0 flex-col border-mc-border bg-mc min-[1080px]:w-[520px] min-[1080px]:border-r">
          <button
            type="button"
            aria-label="Toggle theme"
            title="Toggle theme"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="absolute right-6 top-[18px] z-[4] grid h-8 w-8 place-items-center rounded-[7px] border border-mc-border bg-mc-elev text-mc-text-muted transition-colors hover:border-mc-border-strong hover:bg-mc-surface hover:text-mc-text"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          <LoginForm />
        </div>

        {/* Ambient ops visual */}
        <Visual />
      </div>

      <footer className="flex h-[30px] shrink-0 items-center gap-3.5 border-t border-mc-border bg-mc px-3.5 text-[11px] text-mc-text-dim">
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.01em] text-mc-text-muted">
          <LiveDot />
          Connected · La Paz, Bolivia
        </span>
      </footer>
    </div>
  );
}
