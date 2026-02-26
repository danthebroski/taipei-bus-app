import { gunzipSync } from 'zlib';
import { Route, Stop, EstimateTime } from './types';

// --- Taipei City (tcgbusfs blob storage) ---
const TPE_BASE = 'https://tcgbusfs.blob.core.windows.net/blobbus';

// --- New Taipei City (data.ntpc.gov.tw) ---
const NTPC_BASE = 'https://data.ntpc.gov.tw/api/datasets';
const NTPC_ROUTES_ID = '0EE4E6BF-CEE6-4EC8-8FE1-71F544015127';
const NTPC_STOPS_ID = '34B402A8-53D9-483D-9406-24A682C2D6DC';
const NTPC_ESTIMATES_ID = '07F7CCB3-ED00-43C4-966D-08E9DAB24E95';

interface CacheEntry<T> {
  data: T[];
  fetchedAt: number;
}

const cache: {
  routes?: CacheEntry<Route>;
  stops?: CacheEntry<Stop>;
  estimates?: CacheEntry<EstimateTime>;
} = {};

const STATIC_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const ESTIMATE_CACHE_MS = 10 * 1000; // 10 seconds

// --- Taipei City fetchers (gzipped blob) ---

async function fetchTpeGz<T>(endpoint: string): Promise<T[]> {
  const res = await fetch(`${TPE_BASE}/${endpoint}`);
  if (!res.ok) throw new Error(`Failed to fetch TPE ${endpoint}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const decompressed = gunzipSync(buffer);
  const json = JSON.parse(decompressed.toString('utf-8'));
  return json.BusInfo as T[];
}

// --- NTPC fetchers (paginated JSON API) ---

async function fetchNtpcJson<T>(datasetId: string, pageSize = 100000): Promise<T[]> {
  const res = await fetch(`${NTPC_BASE}/${datasetId}/json?size=${pageSize}`);
  if (!res.ok) throw new Error(`Failed to fetch NTPC ${datasetId}: ${res.status}`);
  return (await res.json()) as T[];
}

// NTPC fields are lowercase; normalize to match Taipei City format

interface NtpcRouteRaw {
  id: string;
  namezh: string;
  nameen: string;
  departurezh: string;
  destinationzh: string;
  gofirstbustime: string;
  golastbustime: string;
  backfirstbustime: string;
  backlastbustime: string;
  peakheadway: string;
  offpeakheadway: string;
}

interface NtpcStopRaw {
  id: string;
  routeid: string;
  namezh: string;
  nameen: string;
  seqno: string;
  goback: string;
  longitude: string;
  latitude: string;
  stoplocationid: string;
}

interface NtpcEstimateRaw {
  routeid: string;
  stopid: string;
  estimatetime: string;
  goback: string;
}

function normalizeNtpcRoute(r: NtpcRouteRaw): Route {
  return {
    Id: parseInt(r.id, 10),
    nameZh: r.namezh,
    nameEn: r.nameen,
    departureZh: r.departurezh,
    destinationZh: r.destinationzh,
    goFirstBusTime: r.gofirstbustime,
    goLastBusTime: r.golastbustime,
    backFirstBusTime: r.backfirstbustime,
    backLastBusTime: r.backlastbustime,
    peakHeadway: r.peakheadway,
    offPeakHeadway: r.offpeakheadway,
  };
}

function normalizeNtpcStop(s: NtpcStopRaw): Stop {
  return {
    Id: parseInt(s.id, 10),
    routeId: parseInt(s.routeid, 10),
    nameZh: s.namezh,
    nameEn: s.nameen,
    seqNo: parseInt(s.seqno, 10),
    goBack: s.goback,
    longitude: s.longitude,
    latitude: s.latitude,
    stopLocationId: parseInt(s.stoplocationid, 10),
  };
}

function normalizeNtpcEstimate(e: NtpcEstimateRaw): EstimateTime {
  return {
    RouteID: parseInt(e.routeid, 10),
    StopID: parseInt(e.stopid, 10),
    EstimateTime: e.estimatetime,
    GoBack: e.goback,
  };
}

// --- Helpers ---

function isFresh(entry: CacheEntry<unknown> | undefined, maxAge: number): boolean {
  return !!entry && Date.now() - entry.fetchedAt < maxAge;
}

function dedupeById<T extends { Id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.Id)) return false;
    seen.add(item.Id);
    return true;
  });
}

// --- Public API (merges both sources) ---

export async function getRoutes(): Promise<Route[]> {
  if (!isFresh(cache.routes, STATIC_CACHE_MS)) {
    const [tpeRaw, ntpcRaw] = await Promise.all([
      fetchTpeGz<Route>('GetRoute.gz'),
      fetchNtpcJson<NtpcRouteRaw>(NTPC_ROUTES_ID),
    ]);
    const tpe = dedupeById(tpeRaw);
    const ntpc = ntpcRaw.map(normalizeNtpcRoute);
    // Merge, with TPE first. NTPC route IDs don't overlap with TPE.
    cache.routes = { data: [...tpe, ...dedupeById(ntpc)], fetchedAt: Date.now() };
  }
  return cache.routes!.data;
}

export async function getStops(): Promise<Stop[]> {
  if (!isFresh(cache.stops, STATIC_CACHE_MS)) {
    const [tpeRaw, ntpcRaw] = await Promise.all([
      fetchTpeGz<Stop>('GetStop.gz'),
      fetchNtpcJson<NtpcStopRaw>(NTPC_STOPS_ID),
    ]);
    const ntpc = ntpcRaw.map(normalizeNtpcStop);
    cache.stops = { data: [...tpeRaw, ...ntpc], fetchedAt: Date.now() };
  }
  return cache.stops!.data;
}

export async function getEstimates(): Promise<EstimateTime[]> {
  if (!isFresh(cache.estimates, ESTIMATE_CACHE_MS)) {
    const [tpeRaw, ntpcRaw] = await Promise.all([
      fetchTpeGz<EstimateTime>('GetEstimateTime.gz'),
      fetchNtpcJson<NtpcEstimateRaw>(NTPC_ESTIMATES_ID),
    ]);
    const ntpc = ntpcRaw.map(normalizeNtpcEstimate);
    cache.estimates = { data: [...tpeRaw, ...ntpc], fetchedAt: Date.now() };
  }
  return cache.estimates!.data;
}
