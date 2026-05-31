import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Download,
  Share2,
  ChevronDown,
} from 'lucide-react';
import { usePlaybackStore, type PlaybackSpeed } from '@/stores/playback.store';
import { getMockPlaybackSegs, getPlaybackTicks } from '@/lib/mock/historyMock';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function fmtTime(isoStr: string): string {
  try {
    return format(new Date(isoStr), 'HH:mm');
  } catch {
    return '--:--';
  }
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8, 16];

function SpeedSelector({
  speed,
  onSelect,
}: {
  speed: PlaybackSpeed;
  onSelect: (s: PlaybackSpeed) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[26px] items-center gap-1 rounded-[6px] border border-border bg-mc-elev px-2 font-mono text-[11.5px] text-muted-foreground"
      >
        <span className="text-[10.5px]">speed</span>
        <span className="font-semibold text-foreground">{speed}×</span>
        <ChevronDown className="h-[11px] w-[11px] text-mc-text-dim" />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+4px)] right-0 z-50 rounded-[7px] border border-border bg-mc-elev shadow-mc-float">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onSelect(s);
                setOpen(false);
              }}
              className={cn(
                'block w-full px-4 py-1.5 text-left font-mono text-[12px] transition-colors hover:bg-mc-surface',
                s === speed && 'text-mc-accent',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PbBtnProps {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  isPlay?: boolean;
  disabled?: boolean;
}

function PbBtn({ onClick, title, children, isPlay = false, disabled = false }: PbBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid place-items-center rounded-[6px] transition-colors',
        isPlay
          ? 'h-8 w-8 rounded-[7px] bg-mc-accent text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.3)] hover:bg-mc-accent-strong'
          : 'h-7 w-7 text-muted-foreground hover:bg-mc-surface hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  );
}

export function RouteHistoryPlaybackBar() {
  const {
    positions,
    currentIndex,
    isPlaying,
    speed,
    setCurrentIndex,
    togglePlayback,
    setSpeed,
    stepForward,
    stepBackward,
    goToStart,
    goToEnd,
    pause,
  } = usePlaybackStore();

  // Auto-advance timer — ported from PlaybackControls.tsx
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && positions.length > 0) {
      const intervalMs = 200 / speed;
      intervalRef.current = setInterval(() => {
        const s = usePlaybackStore.getState();
        if (s.currentIndex >= s.positions.length - 1) {
          s.pause();
        } else {
          s.setCurrentIndex(s.currentIndex + 1);
        }
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, positions.length]);

  if (positions.length === 0) return null;

  const progressFrac = positions.length > 1 ? currentIndex / (positions.length - 1) : 0;
  const currentPos = positions[currentIndex];
  const lastPos = positions[positions.length - 1];

  const segs = getMockPlaybackSegs();
  const ticks = getPlaybackTicks(positions, 8);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (positions.length - 1));
    pause();
    setCurrentIndex(idx);
  };

  return (
    <div
      className="absolute bottom-[14px] left-[14px] right-[14px] z-[1000] grid items-center gap-[14px] rounded-[10px] border border-border bg-mc-elev px-3 py-[10px] shadow-mc-float"
      style={{ gridTemplateColumns: 'auto 1fr auto' }}
    >
      {/* Left: transport controls + time */}
      <div className="flex items-center gap-1">
        <PbBtn title="Restart" onClick={goToStart} disabled={currentIndex === 0}>
          <Rewind className="h-[14px] w-[14px]" />
        </PbBtn>
        <PbBtn title="Step back" onClick={stepBackward} disabled={currentIndex === 0}>
          <SkipBack className="h-[14px] w-[14px]" />
        </PbBtn>
        <PbBtn title={isPlaying ? 'Pause' : 'Play'} onClick={togglePlayback} isPlay>
          {isPlaying ? (
            <Pause className="h-[13px] w-[13px]" />
          ) : (
            <Play className="h-[13px] w-[13px]" />
          )}
        </PbBtn>
        <PbBtn
          title="Step forward"
          onClick={stepForward}
          disabled={currentIndex >= positions.length - 1}
        >
          <SkipForward className="h-[14px] w-[14px]" />
        </PbBtn>
        <PbBtn
          title="Skip to end"
          onClick={goToEnd}
          disabled={currentIndex >= positions.length - 1}
        >
          <FastForward className="h-[14px] w-[14px]" />
        </PbBtn>

        <span className="ml-1 border-l border-border pl-2 font-mono text-[12px] font-semibold tracking-[-0.005em]">
          {fmtTime(currentPos.time)}
          <span className="ml-1 font-normal text-mc-text-dim">/ {fmtTime(lastPos.time)}</span>
        </span>
      </div>

      {/* Center: scrubber track */}
      <div className="flex h-[36px] flex-col justify-center gap-1">
        <div
          className="relative h-[18px] cursor-pointer overflow-hidden rounded-[4px] border border-border bg-mc-surface"
          onClick={handleTrackClick}
        >
          {/* Segment composition */}
          <div className="absolute inset-0 flex">
            {segs.map((s, i) => (
              <span
                key={i}
                className={cn(
                  'h-full',
                  s.kind === 'move' && 'bg-status-moving opacity-85',
                  s.kind === 'idle' && 'bg-status-idle opacity-85',
                  s.kind === 'stop' && 'bg-mc-accent opacity-90',
                  s.kind === 'off' && 'bg-mc-border-strong',
                )}
                style={{ width: `${s.w}%` }}
              />
            ))}
          </div>
          {/* Progress overlay */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 top-0 border-r-[1.5px] border-mc-accent bg-black/[0.18]"
            style={{ width: `${progressFrac * 100}%` }}
          />
          {/* Cursor */}
          <div
            className="pointer-events-none absolute -bottom-[3px] -top-[3px] w-[2px] rounded-[1px] bg-mc-accent"
            style={{
              left: `${progressFrac * 100}%`,
              boxShadow: '0 0 0 3px var(--mc-accent-soft)',
            }}
          >
            <span className="absolute -top-[6px] left-1/2 block h-[10px] w-[10px] -translate-x-1/2 rounded-full border-2 border-mc-elev bg-mc-accent" />
          </div>
        </div>

        {/* Tick labels */}
        <div className="flex justify-between font-mono text-[9.5px] text-mc-text-dim">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>

      {/* Right: speed + action buttons */}
      <div className="flex items-center gap-[6px]">
        <SpeedSelector speed={speed} onSelect={setSpeed} />
        <PbBtn title="Export GPX">
          <Download className="h-[14px] w-[14px]" />
        </PbBtn>
        <PbBtn title="Share">
          <Share2 className="h-[14px] w-[14px]" />
        </PbBtn>
      </div>
    </div>
  );
}
