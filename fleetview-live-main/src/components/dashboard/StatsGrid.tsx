import { Truck, Activity, MapPin, Clock } from "lucide-react";
import { useMemo } from "react";
import type { Driver } from "@/types/driver.types";
import type { EnrichedPosition } from "@/types/position.types";

type DriverWithPosition = Driver & {
  position?: EnrichedPosition;
};

interface StatsGridProps {
  drivers: DriverWithPosition[];
}

const getDriverStatus = (driver: DriverWithPosition): "moving" | "idle" | "offline" => {
  if (!driver.position) return "offline";
  
  const ageMs = new Date().getTime() - new Date(driver.position.time).getTime();
  const ageMinutes = ageMs / 1000 / 60;
  
  if (ageMinutes > 5) return "offline";
  if (driver.position.speed > 2) return "moving";
  return "idle";
};

export function StatsGrid({ drivers }: StatsGridProps) {
  const stats = useMemo(() => {
    const moving = drivers.filter((d) => getDriverStatus(d) === "moving").length;
    const withPositions = drivers.filter(d => d.position);
    
    const avgSpeed = withPositions.length > 0
      ? Math.round(withPositions.reduce((sum, d) => sum + (d.position!.speed * 1.852), 0) / withPositions.length) // knots to km/h
      : 0;
    
    // For now, we don't have distance or visits data in positions
    // These would come from backend aggregations
    const totalDistance = 0;
    const totalVisits = 0;
    
    return { moving, totalDistance, totalVisits, avgSpeed };
  }, [drivers]);

  const cards = [
    {
      label: "Moving Drivers",
      value: stats.moving,
      suffix: `/ ${drivers.length}`,
      icon: Truck,
      accent: "text-fleet-active",
      bg: "bg-fleet-active-bg",
    },
    {
      label: "Avg Speed",
      value: stats.avgSpeed,
      suffix: "km/h",
      icon: Activity,
      accent: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Distance Today",
      value: stats.totalDistance,
      suffix: "km",
      icon: Clock,
      accent: "text-fleet-idle",
      bg: "bg-fleet-idle-bg",
    },
    {
      label: "Visits Today",
      value: stats.totalVisits,
      suffix: "completed",
      icon: MapPin,
      accent: "text-visit-completed",
      bg: "bg-fleet-active-bg",
    },
  ];

  return (
    <>
      {cards.map((card) => (
        <div key={card.label} className="bento-card p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
            <card.icon className={`w-5 h-5 ${card.accent}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-bold leading-tight">
              {card.value}
              <span className="text-xs font-normal text-muted-foreground ml-1">{card.suffix}</span>
            </p>
          </div>
        </div>
      ))}
    </>
  );
}
