/** Raster tile sources shared by every Leaflet map. */
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const DEFAULT_TILES = {
  dark: {
    url: 'https://basemap.queeniemella.cc/tiles/countries/{z}/{x}/{y}.png',
    attribution: `&copy; <a href="https://queeniemella.cc">queeniemella</a> | ${OSM_ATTRIBUTION}`,
  },
  light: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
  },
} as const;

export function getMapTiles(isDark: boolean): { url: string; attribution: string } {
  const theme = isDark ? 'dark' : 'light';
  const customUrl = (isDark ? import.meta.env.VITE_MAP_TILE_URL_DARK : import.meta.env.VITE_MAP_TILE_URL_LIGHT)?.trim();
  const customAttribution = import.meta.env.VITE_MAP_TILE_ATTRIBUTION?.trim();

  // A custom provider needs its own credit; keep the known default if it is missing.
  if (customUrl && customAttribution) {
    return { url: customUrl, attribution: customAttribution };
  }
  return DEFAULT_TILES[theme];
}
