import { useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { usePlaybackStore, type PlaybackSpeed } from '@/stores/playback.store';
import { format } from 'date-fns';

export function PlaybackControls() {
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance playback
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && positions.length > 0) {
      const baseIntervalMs = 200; // base interval between points
      const intervalMs = baseIntervalMs / speed;

      intervalRef.current = setInterval(() => {
        const state = usePlaybackStore.getState();
        if (state.currentIndex >= state.positions.length - 1) {
          state.pause();
        } else {
          state.setCurrentIndex(state.currentIndex + 1);
        }
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, speed, positions.length]);

  if (positions.length === 0) {
    return null;
  }

  const currentPosition = positions[currentIndex];
  const progress = positions.length > 1 ? (currentIndex / (positions.length - 1)) * 100 : 0;

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'HH:mm:ss');
    } catch {
      return '--:--:--';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '';
    }
  };

  const startTime = positions[0]?.time;
  const endTime = positions[positions.length - 1]?.time;

  return (
    <div className="bg-card border border-border/50 rounded-lg shadow-lg p-4 space-y-3">
      {/* Time info bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDate(startTime)}</span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {positions.length} points
          </Badge>
          {currentPosition && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {currentPosition.speed?.toFixed(1) ?? 0} km/h
            </Badge>
          )}
        </div>
        <span>{formatDate(endTime)}</span>
      </div>

      {/* Timeline slider */}
      <div className="space-y-1">
        <Slider
          value={[currentIndex]}
          min={0}
          max={Math.max(0, positions.length - 1)}
          step={1}
          onValueChange={([value]) => {
            pause();
            setCurrentIndex(value);
          }}
          className="cursor-pointer"
        />
        <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
          <span>{formatTime(startTime)}</span>
          <span className="text-foreground font-semibold">
            {currentPosition ? formatTime(currentPosition.time) : '--:--:--'}
          </span>
          <span>{formatTime(endTime)}</span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Left — transport buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToStart}
            disabled={currentIndex === 0}
            title="Go to start"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={stepBackward}
            disabled={currentIndex === 0}
            title="Step back"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={togglePlayback}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={stepForward}
            disabled={currentIndex >= positions.length - 1}
            title="Step forward"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToEnd}
            disabled={currentIndex >= positions.length - 1}
            title="Go to end"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Right — speed selector */}
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={String(speed)}
            onValueChange={(v) => setSpeed(Number(v) as PlaybackSpeed)}
          >
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
              <SelectItem value="8">8x</SelectItem>
              <SelectItem value="16">16x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Current position info */}
      {currentPosition && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border/50 pt-2">
          <span>
            Lat: <span className="font-mono text-foreground">{currentPosition.latitude.toFixed(5)}</span>
          </span>
          <span>
            Lon: <span className="font-mono text-foreground">{currentPosition.longitude.toFixed(5)}</span>
          </span>
          {currentPosition.customerName && (
            <span>
              Near: <span className="text-foreground">{currentPosition.customerName}</span>
            </span>
          )}
          {currentPosition.distanceToNextM != null && (
            <span>
              Dist: <span className="font-mono text-foreground">
                {(currentPosition.distanceToNextM / 1000).toFixed(2)} km
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
