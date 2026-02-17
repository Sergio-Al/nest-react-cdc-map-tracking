#!/bin/bash
set -e

# ─── OSRM Setup Script for La Paz, Bolivia ──────────────────
# Downloads Bolivia map data, clips to the La Paz department,
# and pre-processes it for the OSRM routing engine.
#
# Usage:
#   chmod +x infrastructure/osrm/setup.sh
#   ./infrastructure/osrm/setup.sh
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
mkdir -p "$DATA_DIR"

BOLIVIA_PBF="$DATA_DIR/bolivia-latest.osm.pbf"
LA_PAZ_PBF="$DATA_DIR/la-paz.osm.pbf"

# La Paz department bounding box
# West: -69.65, South: -17.05, East: -67.0, North: -13.5
BBOX="-69.65,-17.05,-67.0,-13.5"

echo "═══════════════════════════════════════════════════"
echo "  OSRM Setup — La Paz, Bolivia"
echo "═══════════════════════════════════════════════════"

# ── Step 1: Download Bolivia map data ────────────────────
if [ ! -f "$BOLIVIA_PBF" ]; then
    echo ""
    echo "📥 Downloading Bolivia map data from Geofabrik..."
    curl -L -o "$BOLIVIA_PBF" \
        https://download.geofabrik.de/south-america/bolivia-latest.osm.pbf
    echo "✔ Download complete"
else
    echo "✔ Bolivia PBF already exists, skipping download"
fi

# ── Step 2: Clip to La Paz department ────────────────────
if [ ! -f "$LA_PAZ_PBF" ]; then
    echo ""
    echo "✂️  Clipping to La Paz department (bbox: $BBOX)..."
    docker run --rm -t -v "$DATA_DIR:/data" \
        stefda/osmium-tool \
        osmium extract \
        --bbox="$BBOX" \
        /data/bolivia-latest.osm.pbf \
        -o /data/la-paz.osm.pbf --overwrite
    echo "✔ Clipping complete"
else
    echo "✔ La Paz PBF already exists, skipping clip"
fi

# ── Step 3: OSRM Extract ────────────────────────────────
if [ ! -f "$DATA_DIR/la-paz.osrm" ]; then
    echo ""
    echo "🔧 Extracting road network..."
    docker run --rm -t -v "$DATA_DIR:/data" \
        osrm/osrm-backend:latest \
        osrm-extract -p /opt/car.lua /data/la-paz.osm.pbf
    echo "✔ Extract complete"
else
    echo "✔ OSRM extract already exists, skipping"
fi

# ── Step 4: OSRM Partition ──────────────────────────────
if [ ! -f "$DATA_DIR/la-paz.osrm.partition" ]; then
    echo ""
    echo "🔧 Partitioning..."
    docker run --rm -t -v "$DATA_DIR:/data" \
        osrm/osrm-backend:latest \
        osrm-partition /data/la-paz.osrm
    echo "✔ Partition complete"
else
    echo "✔ OSRM partition already exists, skipping"
fi

# ── Step 5: OSRM Customize ─────────────────────────────
if [ ! -f "$DATA_DIR/la-paz.osrm.cell_metrics" ]; then
    echo ""
    echo "🔧 Customizing..."
    docker run --rm -t -v "$DATA_DIR:/data" \
        osrm/osrm-backend:latest \
        osrm-customize /data/la-paz.osrm
    echo "✔ Customize complete"
else
    echo "✔ OSRM customize already exists, skipping"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ OSRM data ready!"
echo "  Start with: docker compose up osrm"
echo "  Test with:  curl http://localhost:5000/health"
echo "═══════════════════════════════════════════════════"
