import { gunzipSync } from 'zlib';
import { Route, Stop, EstimateTime } from './types';

// --- Taipei City (tcgbusfs blob storage) ---
const TPE_BASE = 'https://tcgbusfs.blob.core.windows.net/blobbus';

// --- New Taipei City (data.ntpc.gov.tw) ---
const NTPC_BASE = 'https://data.ntpc.gov.tw/api/datasets';
const NTPC_ROUTES_ID = '0EE4E6BF-CEE6-4EC8-8FE1-71F544015127';
const NTPC_STOPS_ID = '34B402A8-53D9-483D-9406-24A682C2D6DC';
const NTPC_ESTIMATES_ID = '07F7CCB3-ED00-43C4-966D-08E9DAB24E95';

// --- TDX (Transport Data eXchange) - MOTC ---
const TDX_BASE = 'https://tdx.transportdata.tw/api/basic';
const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';

// All TDX city codes for bus data
const TDX_CITIES = [
  'Taipei',
  'NewTaipei',
  'Keelung',
  'Taoyuan',
  'Hsinchu',
  'HsinchuCounty',
  'MiaoliCounty',
  'Taichung',
  'ChanghuaCounty',
  'NantouCounty',
  'YunlinCounty',
  'ChiayiCounty',
  'Chiayi',
  'Tainan',
  'Kaohsiung',
  'PingtungCounty',
  'YilanCounty',
  'HualienCounty',
  'TaitungCounty',
  'KinmenCounty',
  'PenghuCounty',
  'LienchiangCounty',
] as const;

type TdxCity = (typeof TDX_CITIES)[number] | 'InterCity';

// Large offsets per city to prevent ID collisions with TPE/NTPC data
const CITY_ID_OFFSET: Record<TdxCity, number> = {
  Taipei: 10_000_000,
  NewTaipei: 11_000_000,
  Keelung: 12_000_000,
  Taoyuan: 13_000_000,
  Hsinchu: 14_000_000,
  HsinchuCounty: 15_000_000,
  MiaoliCounty: 16_000_000,
  Taichung: 17_000_000,
  ChanghuaCounty: 18_000_000,
  NantouCounty: 19_000_000,
  YunlinCounty: 20_000_000,
  ChiayiCounty: 21_000_000,
  Chiayi: 22_000_000,
  Tainan: 23_000_000,
  Kaohsiung: 24_000_000,
  PingtungCounty: 25_000_000,
  YilanCounty: 26_000_000,
  HualienCounty: 27_000_000,
  TaitungCounty: 28_000_000,
  KinmenCounty: 29_000_000,
  PenghuCounty: 30_000_000,
  LienchiangCounty: 31_000_000,
  InterCity: 32_000_000,
};

// --- Cache ---

interface CacheEntry<T> {
  data: T[];
  fetchedAt: number;
}

const cache: {
  routes?: CacheEntry<Route>;
  stops?: CacheEntry<Stop>;
  estimates?: CacheEntry<EstimateTime>;
} = {};

// Maps TDX route IDs to their source city (populated during route normalization)
const tdxRouteCity = new Map<number, TdxCity>();

// Per-city TDX estimate cache (fetched on-demand, not in bulk)
const tdxEstimateCache = new Map<TdxCity, CacheEntry<EstimateTime>>();
const TDX_ESTIMATE_CACHE_MS = 15_000; // 15 seconds

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

// --- TDX Token Management ---

let tdxToken: { accessToken: string; expiresAt: number } | null = null;

async function getTdxToken(): Promise<string | null> {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tdxToken && Date.now() < tdxToken.expiresAt) {
    return tdxToken.accessToken;
  }

  try {
    const res = await fetch(TDX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    });
    if (!res.ok) {
      console.error(`TDX token request failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    tdxToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
    return tdxToken.accessToken;
  } catch (err) {
    console.error('TDX token error:', err);
    return null;
  }
}

// --- TDX Fetcher ---

async function fetchTdx<T>(path: string): Promise<T[]> {
  try {
    const token = await getTdxToken();
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; TaipeiBusApp/1.0)',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${TDX_BASE}${path}`, { headers });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

// --- TDX Response Types ---

interface TdxName {
  Zh_tw: string;
  En: string;
}

interface TdxRoute {
  RouteUID: string;
  RouteID: string;
  RouteName: TdxName;
  DepartureStopNameZh?: string;
  DestinationStopNameZh?: string;
  SubRoutes?: Array<{
    Direction: number;
    FirstBusTime?: string;
    LastBusTime?: string;
  }>;
}

interface TdxStopOfRoute {
  RouteUID: string;
  RouteID: string;
  Direction: number;
  Stops: Array<{
    StopUID: string;
    StopID: string;
    StopName: TdxName;
    StopSequence: number;
    StopPosition: { PositionLat: number; PositionLon: number };
    StationID?: string;
  }>;
}

interface TdxEstimate {
  RouteUID: string;
  RouteID: string;
  StopUID: string;
  StopID: string;
  Direction: number;
  EstimateTime?: number;
  StopStatus?: number;
}

// --- TDX Helpers ---

function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  }
  return h % 1_000_000;
}

function tdxId(rawId: string, city: TdxCity): number {
  const offset = CITY_ID_OFFSET[city];
  const n = parseInt(rawId, 10);
  return offset + (isNaN(n) ? stableHash(rawId) : n);
}

// --- TDX Normalizers ---

function normalizeTdxRoute(r: TdxRoute, city: TdxCity): Route {
  const goSub = r.SubRoutes?.find((s) => s.Direction === 0);
  const backSub = r.SubRoutes?.find((s) => s.Direction === 1);
  const id = tdxId(r.RouteID, city);
  tdxRouteCity.set(id, city);
  return {
    Id: id,
    nameZh: r.RouteName.Zh_tw,
    nameEn: r.RouteName.En || '',
    departureZh: r.DepartureStopNameZh || '',
    destinationZh: r.DestinationStopNameZh || '',
    goFirstBusTime: goSub?.FirstBusTime || '',
    goLastBusTime: goSub?.LastBusTime || '',
    backFirstBusTime: backSub?.FirstBusTime || '',
    backLastBusTime: backSub?.LastBusTime || '',
    peakHeadway: '',
    offPeakHeadway: '',
  };
}

function normalizeTdxStops(sor: TdxStopOfRoute, city: TdxCity): Stop[] {
  const routeId = tdxId(sor.RouteID, city);
  return sor.Stops.map((s) => ({
    Id: tdxId(s.StopID, city),
    routeId,
    nameZh: s.StopName.Zh_tw,
    nameEn: s.StopName.En || '',
    seqNo: s.StopSequence,
    goBack: String(sor.Direction),
    longitude: String(s.StopPosition.PositionLon),
    latitude: String(s.StopPosition.PositionLat),
    stopLocationId: s.StationID ? tdxId(s.StationID, city) : 0,
  }));
}

function normalizeTdxEstimate(e: TdxEstimate, city: TdxCity): EstimateTime {
  let est: string;
  if (e.EstimateTime != null && e.EstimateTime >= 0) {
    est = String(e.EstimateTime);
  } else {
    const statusMap: Record<number, string> = {
      1: '-1',
      2: '-2',
      3: '-3',
      4: '-4',
    };
    est = statusMap[e.StopStatus ?? 4] ?? '-4';
  }
  return {
    RouteID: tdxId(e.RouteID, city),
    StopID: tdxId(e.StopID, city),
    EstimateTime: est,
    GoBack: String(e.Direction),
  };
}

// --- TDX Batch Fetchers ---

async function fetchAllTdxRoutes(): Promise<Route[]> {
  const promises = [
    ...TDX_CITIES.map((city) =>
      fetchTdx<TdxRoute>(`/v2/Bus/Route/City/${city}?$format=JSON`).then(
        (routes) => routes.map((r) => normalizeTdxRoute(r, city))
      )
    ),
    fetchTdx<TdxRoute>('/v2/Bus/Route/InterCity?$format=JSON').then((routes) =>
      routes.map((r) => normalizeTdxRoute(r, 'InterCity'))
    ),
  ];
  const results = await Promise.allSettled(promises);
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Route[]> => r.status === 'fulfilled'
    )
    .flatMap((r) => r.value);
}

async function fetchAllTdxStops(): Promise<Stop[]> {
  const promises = [
    ...TDX_CITIES.map((city) =>
      fetchTdx<TdxStopOfRoute>(
        `/v2/Bus/StopOfRoute/City/${city}?$format=JSON`
      ).then((data) => data.flatMap((sor) => normalizeTdxStops(sor, city)))
    ),
    fetchTdx<TdxStopOfRoute>(
      '/v2/Bus/StopOfRoute/InterCity?$format=JSON'
    ).then((data) =>
      data.flatMap((sor) => normalizeTdxStops(sor, 'InterCity'))
    ),
  ];
  const results = await Promise.allSettled(promises);
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Stop[]> => r.status === 'fulfilled'
    )
    .flatMap((r) => r.value);
}

async function fetchTdxEstimatesForCity(city: TdxCity): Promise<EstimateTime[]> {
  const cached = tdxEstimateCache.get(city);
  if (isFresh(cached, TDX_ESTIMATE_CACHE_MS)) return cached!.data;

  const path =
    city === 'InterCity'
      ? '/v2/Bus/EstimatedTimeOfArrival/InterCity?$format=JSON'
      : `/v2/Bus/EstimatedTimeOfArrival/City/${city}?$format=JSON`;
  const raw = await fetchTdx<TdxEstimate>(path);
  const estimates = raw.map((e) => normalizeTdxEstimate(e, city));
  tdxEstimateCache.set(city, { data: estimates, fetchedAt: Date.now() });
  return estimates;
}

// --- Helpers ---

function isFresh(
  entry: CacheEntry<unknown> | undefined,
  maxAge: number
): boolean {
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

// --- Public API (merges all sources) ---

export async function getRoutes(): Promise<Route[]> {
  if (!isFresh(cache.routes, STATIC_CACHE_MS)) {
    const [tpeRaw, ntpcRaw, tdxRoutes] = await Promise.all([
      fetchTpeGz<Route>('GetRoute.gz'),
      fetchNtpcJson<NtpcRouteRaw>(NTPC_ROUTES_ID),
      fetchAllTdxRoutes().catch(() => [] as Route[]),
    ]);

    const tpe = dedupeById(tpeRaw);
    const ntpc = ntpcRaw.map(normalizeNtpcRoute);
    const primary = [...tpe, ...dedupeById(ntpc)];

    // Only add TDX routes whose names aren't already in TPE/NTPC
    const primaryNames = new Set(primary.map((r) => r.nameZh));
    const newTdx = tdxRoutes.filter((r) => !primaryNames.has(r.nameZh));

    cache.routes = {
      data: [...primary, ...newTdx],
      fetchedAt: Date.now(),
    };
  }
  return cache.routes!.data;
}

export async function getStops(): Promise<Stop[]> {
  if (!isFresh(cache.stops, STATIC_CACHE_MS)) {
    const [tpeRaw, ntpcRaw, tdxStops] = await Promise.all([
      fetchTpeGz<Stop>('GetStop.gz'),
      fetchNtpcJson<NtpcStopRaw>(NTPC_STOPS_ID),
      fetchAllTdxStops().catch(() => [] as Stop[]),
    ]);
    const ntpc = ntpcRaw.map(normalizeNtpcStop);
    cache.stops = {
      data: [...tpeRaw, ...ntpc, ...tdxStops],
      fetchedAt: Date.now(),
    };
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
    cache.estimates = {
      data: [...tpeRaw, ...ntpc],
      fetchedAt: Date.now(),
    };
  }
  return cache.estimates!.data;
}

export async function getEstimatesForRoute(
  routeId: number
): Promise<EstimateTime[]> {
  // First try bulk TPE/NTPC estimates
  const bulk = await getEstimates();
  const matched = bulk.filter((e) => e.RouteID === routeId);
  if (matched.length > 0) return matched;

  // If no results and this is a TDX route, fetch from that specific city
  const city = tdxRouteCity.get(routeId);
  if (!city) return [];

  const cityEstimates = await fetchTdxEstimatesForCity(city).catch(
    () => [] as EstimateTime[]
  );
  return cityEstimates.filter((e) => e.RouteID === routeId);
}
