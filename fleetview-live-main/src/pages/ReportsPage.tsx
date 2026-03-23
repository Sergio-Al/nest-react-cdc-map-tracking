import { useState, useMemo } from 'react';
import { FileBarChart, Download, Search } from 'lucide-react';
import {
  useRoutesByDateRange,
  useVisitCompletions,
  useDriverHistory,
  useDriverDailyStats,
} from '@/hooks/api/useHistory';
import { useDrivers } from '@/hooks/api/useDrivers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { exportToCsv } from '@/lib/utils';

const ROUTE_STATUS_STYLES: Record<string, string> = {
  planned: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
  in_progress: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20',
  completed: 'bg-green-500/15 text-green-600 border-green-500/20',
  cancelled: 'bg-red-500/15 text-red-600 border-red-500/20',
};

const VISIT_STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-500/15 text-green-600 border-green-500/20',
  failed: 'bg-red-500/15 text-red-600 border-red-500/20',
  skipped: 'bg-secondary text-muted-foreground border-border',
  in_progress: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20',
};

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-BO', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>{message}</p>
    </div>
  );
}

export default function ReportsPage() {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [routeStatus, setRouteStatus] = useState<string>('all');
  const [visitDriverId, setVisitDriverId] = useState<string>('all');
  const [positionsDriverId, setPositionsDriverId] = useState<string>('');

  const { data: drivers = [] } = useDrivers();

  // Build a lookup map for driver names
  const driverMap = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((d) => map.set(d.id, d.name));
    return map;
  }, [drivers]);

  // ── Queries ──────────────────────────────────────────
  const routesQuery = useRoutesByDateRange(
    from, to,
    routeStatus !== 'all' ? routeStatus : undefined,
  );
  const visitsQuery = useVisitCompletions(
    from, to,
    visitDriverId !== 'all' ? visitDriverId : undefined,
  );
  const positionsQuery = useDriverHistory(
    positionsDriverId || null, from, to,
  );
  const statsQuery = useDriverDailyStats(from, to);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <FileBarChart className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
            <p className="text-sm text-muted-foreground">
              Consulta y exporta datos históricos del sistema
            </p>
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Desde</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
          <label className="text-sm text-muted-foreground">Hasta</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="routes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="routes">Rutas</TabsTrigger>
          <TabsTrigger value="visits">Visitas</TabsTrigger>
          <TabsTrigger value="positions">Posiciones</TabsTrigger>
          <TabsTrigger value="stats">Estadísticas</TabsTrigger>
        </TabsList>

        {/* ── Tab: Rutas ───────────────────────────────── */}
        <TabsContent value="routes" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={routeStatus} onValueChange={setRouteStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="planned">Planificada</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!routesQuery.data?.length}
              onClick={() =>
                exportToCsv(
                  (routesQuery.data ?? []).map((r) => ({
                    Fecha: r.scheduledDate,
                    Conductor: driverMap.get(r.driverId) ?? r.driverId,
                    Estado: r.status,
                    'Paradas completadas': r.completedStops,
                    'Paradas totales': r.totalStops,
                    'Distancia (m)': r.totalDistanceMeters ?? '',
                  })),
                  'rutas',
                )
              }
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          </div>

          {routesQuery.isLoading ? (
            <LoadingSkeleton />
          ) : !routesQuery.data?.length ? (
            <EmptyState message="Sin rutas en el rango seleccionado" />
          ) : (
            <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Conductor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Paradas</TableHead>
                    <TableHead>Distancia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routesQuery.data.map((route) => (
                    <TableRow key={route.id} className="border-border/50">
                      <TableCell>{formatDate(route.scheduledDate)}</TableCell>
                      <TableCell className="font-medium">
                        {driverMap.get(route.driverId) ?? route.driverId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            ROUTE_STATUS_STYLES[route.status] ?? ''
                          }
                        >
                          {route.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {route.completedStops}/{route.totalStops}
                      </TableCell>
                      <TableCell>
                        {route.totalDistanceMeters != null
                          ? `${(route.totalDistanceMeters / 1000).toFixed(1)} km`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Visitas ─────────────────────────────── */}
        <TabsContent value="visits" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={visitDriverId} onValueChange={setVisitDriverId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Conductor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los conductores</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!visitsQuery.data?.length}
              onClick={() =>
                exportToCsv(
                  (visitsQuery.data ?? []).map((v) => ({
                    'Fecha/Hora': v.time,
                    Conductor: driverMap.get(v.driverId) ?? v.driverId,
                    'ID Cliente': v.customerId,
                    Tipo: v.visitType,
                    Estado: v.status,
                    'Duración (s)': v.durationSec ?? '',
                    Puntual: v.onTime ? 'Sí' : 'No',
                  })),
                  'visitas',
                )
              }
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          </div>

          {visitsQuery.isLoading ? (
            <LoadingSkeleton />
          ) : !visitsQuery.data?.length ? (
            <EmptyState message="Sin registros de visitas en el rango seleccionado" />
          ) : (
            <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Conductor</TableHead>
                    <TableHead>ID Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Puntual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visitsQuery.data.map((v) => (
                    <TableRow key={v.visitId + v.time} className="border-border/50">
                      <TableCell>{formatDateTime(v.time)}</TableCell>
                      <TableCell className="font-medium">
                        {driverMap.get(v.driverId) ?? v.driverId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{v.customerId}</TableCell>
                      <TableCell className="capitalize">{v.visitType}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            VISIT_STATUS_STYLES[v.status] ?? ''
                          }
                        >
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {v.durationSec != null
                          ? `${Math.round(v.durationSec / 60)} min`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {v.onTime ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-red-500">✗</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Posiciones ──────────────────────────── */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={positionsDriverId} onValueChange={setPositionsDriverId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Seleccionar conductor" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!positionsQuery.data?.length}
              onClick={() =>
                exportToCsv(
                  (positionsQuery.data ?? []).map((p) => ({
                    'Fecha/Hora': p.time,
                    Conductor: driverMap.get(p.driverId) ?? p.driverId,
                    Latitud: p.latitude,
                    Longitud: p.longitude,
                    'Velocidad (km/h)': p.speed,
                    Rumbo: p.heading,
                    Ruta: p.routeId ?? '',
                    Cliente: p.customerName ?? '',
                  })),
                  'posiciones',
                )
              }
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          </div>

          {!positionsDriverId ? (
            <EmptyState message="Selecciona un conductor para consultar posiciones" />
          ) : positionsQuery.isLoading ? (
            <LoadingSkeleton />
          ) : !positionsQuery.data?.length ? (
            <EmptyState message="Sin posiciones registradas en el rango seleccionado" />
          ) : (
            <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Latitud</TableHead>
                    <TableHead>Longitud</TableHead>
                    <TableHead>Velocidad</TableHead>
                    <TableHead>Rumbo</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Cliente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positionsQuery.data.map((p, idx) => (
                    <TableRow key={`${p.time}-${idx}`} className="border-border/50">
                      <TableCell>{formatDateTime(p.time)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.latitude.toFixed(6)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.longitude.toFixed(6)}</TableCell>
                      <TableCell>{p.speed.toFixed(1)} km/h</TableCell>
                      <TableCell>{p.heading.toFixed(0)}°</TableCell>
                      <TableCell className="text-xs">
                        {p.routeId?.slice(0, 8) ?? '—'}
                      </TableCell>
                      <TableCell>{p.customerName ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Estadísticas ────────────────────────── */}
        <TabsContent value="stats" className="space-y-4">
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={!statsQuery.data?.length}
              onClick={() =>
                exportToCsv(
                  (statsQuery.data ?? []).map((s) => ({
                    Fecha: s.bucket,
                    Conductor: driverMap.get(s.driverId) ?? s.driverId,
                    Posiciones: s.positionCount,
                    'Vel. Promedio (km/h)': Number(s.avgSpeed).toFixed(1),
                    'Vel. Máxima (km/h)': Number(s.maxSpeed).toFixed(1),
                    'Ratio Movimiento': Number(s.movingRatio).toFixed(2),
                  })),
                  'estadisticas',
                )
              }
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
          </div>

          {statsQuery.isLoading ? (
            <LoadingSkeleton />
          ) : !statsQuery.data?.length ? (
            <EmptyState message="Sin estadísticas disponibles en el rango seleccionado" />
          ) : (
            <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Conductor</TableHead>
                    <TableHead>Posiciones</TableHead>
                    <TableHead>Vel. Promedio</TableHead>
                    <TableHead>Vel. Máxima</TableHead>
                    <TableHead>Ratio Movimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsQuery.data.map((s, idx) => (
                    <TableRow key={`${s.bucket}-${s.driverId}-${idx}`} className="border-border/50">
                      <TableCell>{formatDate(s.bucket)}</TableCell>
                      <TableCell className="font-medium">
                        {driverMap.get(s.driverId) ?? s.driverId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{s.positionCount}</TableCell>
                      <TableCell>{Number(s.avgSpeed).toFixed(1)} km/h</TableCell>
                      <TableCell>{Number(s.maxSpeed).toFixed(1)} km/h</TableCell>
                      <TableCell>{(Number(s.movingRatio) * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
