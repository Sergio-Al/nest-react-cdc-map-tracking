"""
Validación de la implementación Haversine (tracking-service/src/modules/enrichment/geo-utils.ts)
contra la distancia geodésica sobre el elipsoide WGS84 (algoritmo de Karney, geographiclib),
usando los 23 clientes seed de La Paz (infrastructure/mysql/init/02-seed-customers-lapaz.sql).

Mide el error de la aproximación esférica frente a la elipsoidal. NO compara contra OSRM:
OSRM mide recorrido vial, que es otra métrica.

Requisitos: pip install geographiclib==2.1
Uso: python3 scripts/validation/validacion_haversine_geodesica.py infrastructure/mysql/init/02-seed-customers-lapaz.sql
"""
import itertools
import math
import re
import statistics
import sys

from geographiclib.geodesic import Geodesic

R = 6_371_000  # mismo radio que geo-utils.ts


def haversine_m(lat1, lon1, lat2, lon2):
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Filas del INSERT: (id, 'tenant', 'nombre', ..., lat, lon, radio_geocerca, ...)
rows = re.findall(r"^\((\d+),\s*'[^']*',\s*'([^']*)'.*?(-1[67]\.\d+),\s*(-68\.\d+),\s*(\d+)",
                  open(sys.argv[1], encoding="utf-8").read(), re.M)
pts = [(int(i), n.strip(), float(la), float(lo), int(r)) for i, n, la, lo, r in rows]
print(f"Puntos: {len(pts)}")

# Escala de pares de clientes
errs_pct, errs_m, dists = [], [], []
for a, b in itertools.combinations(pts, 2):
    g = Geodesic.WGS84.Inverse(a[2], a[3], b[2], b[3])["s12"]
    h = haversine_m(a[2], a[3], b[2], b[3])
    errs_pct.append(abs(h - g) / g * 100)
    errs_m.append(abs(h - g))
    dists.append(g)
print(f"Pares: {len(dists)}  distancia geodésica min/max: {min(dists):.0f} m / {max(dists):.0f} m")
print(f"Error relativo  medio: {statistics.mean(errs_pct):.3f} %  máx: {max(errs_pct):.3f} %")
print(f"Error absoluto  medio: {statistics.mean(errs_m):.2f} m  máx: {max(errs_m):.2f} m")

# Escala de geocerca: punto situado exactamente a distancia = radio de cada cliente, 8 rumbos
gf_m, gf_pct = [], []
for p in pts:
    for az in range(0, 360, 45):
        q = Geodesic.WGS84.Direct(p[2], p[3], az, p[4])
        e = abs(haversine_m(p[2], p[3], q["lat2"], q["lon2"]) - p[4])
        gf_m.append(e)
        gf_pct.append(e / p[4] * 100)
print(f"Escala geocerca (radios {min(p[4] for p in pts)}–{max(p[4] for p in pts)} m, {len(gf_m)} puntos):")
print(f"  Error relativo  medio: {statistics.mean(gf_pct):.2f} %  máx: {max(gf_pct):.2f} %")
print(f"  Error absoluto  medio: {statistics.mean(gf_m):.2f} m  máx: {max(gf_m):.2f} m")
