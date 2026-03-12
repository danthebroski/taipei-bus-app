import { Stop, EstimateTime } from './types';

const EBUS_BASE = 'https://ebus.gov.taipei';
const TDX_BASE = 'https://tdx.transportdata.tw/api/basic/v2';
const PAGE_CACHE_MS = 25 * 60 * 1000; // 25 min — CSRF token validity
const ESTIMATE_CACHE_MS = 15 * 1000;  // 15 s — real-time data

interface EbusStop {
  uniStopId: string;
  lat: string; // kept as original string to avoid float precision issues
  lon: string;
}

interface EbusStopStatus {
  UniStationId: string;
  ETA: number; // seconds; 0 = bus at stop
  RouteDirect: number;
}

interface PageData {
  token: string;
  cookieHeader: string;
  stops: EbusStop[];
  fetchedAt: number;
}

interface EstimateData {
  data: EbusStopStatus[];
  fetchedAt: number;
}

function isFresh(fetchedAt: number | undefined, maxAge: number): boolean {
  return fetchedAt !== undefined && Date.now() - fetchedAt < maxAge;
}

const pageCache = new Map<string, PageData>();
const estimateCache = new Map<string, EstimateData>();

async function fetchPageData(nid: string): Promise<PageData> {
  const url = `${EBUS_BASE}/Route/StopsOfRoute?routeid=${nid}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`ebus page fetch failed: ${res.status}`);

  const html = await res.text();

  // Extract CSRF token (last one on the page is the populated one)
  const tokenMatches = [
    ...html.matchAll(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/g),
  ];
  const token = tokenMatches.at(-1)?.[1];
  if (!token) throw new Error('ebus: could not extract CSRF token');

  // Collect cookies for the POST request
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookieHeader = setCookie
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(';')[0].trim())
    .join('; ');

  // Extract stop list: UniStopId + lat/lon
  const stops: EbusStop[] = [];
  const pattern =
    /item_UniStopId[^>]*value="([^"]+)".*?item_Latitude[^>]*value="([^"]+)".*?item_Longitude[^>]*value="([^"]+)"/gs;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    stops.push({
      uniStopId: m[1],
      lat: m[2],
      lon: m[3],
    });
  }

  return { token, cookieHeader, stops, fetchedAt: Date.now() };
}

async function fetchStopStatuses(
  nid: string,
  token: string,
  cookieHeader: string,
): Promise<EbusStopStatus[]> {
  const url = `${EBUS_BASE}/Route/StopStatusOfRoute?routeid=${nid}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${EBUS_BASE}/Route/StopsOfRoute?routeid=${nid}`,
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookieHeader,
    },
    body: `__RequestVerificationToken=${encodeURIComponent(token)}`,
  });

  if (!res.ok) throw new Error(`ebus POST failed: ${res.status}`);

  const text = await res.text();
  // The API returns a double-encoded JSON string
  const parsed = JSON.parse(text);
  return (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as EbusStopStatus[];
}

// --- NId lookup via TDX (Taiwan Transport Data eXchange) ---
// TDX is the official national API; its RouteMapImageUrl contains the ebus NId.

const nidCache = new Map<number, { nid: string | null; fetchedAt: number }>();
const NID_CACHE_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Looks up the ebus.gov.taipei route ID (NId) for a route that doesn't have one
 * in our local data (e.g. NTPC routes). Uses the TDX national API.
 */
export async function getEbusNId(
  routeId: number,
  nameZh: string,
): Promise<string | null> {
  const cached = nidCache.get(routeId);
  if (cached && isFresh(cached.fetchedAt, NID_CACHE_MS)) return cached.nid;

  // Try Taipei City first, then New Taipei City
  for (const city of ['Taipei', 'NewTaipei']) {
    try {
      const filter = encodeURIComponent(`RouteName/Zh_tw eq '${nameZh}'`);
      const url = `${TDX_BASE}/Bus/Route/City/${city}?$filter=${filter}&$format=JSON`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const routes = await res.json() as Array<{ RouteID: number; RouteMapImageUrl?: string }>;
      for (const r of routes) {
        if (Number(r.RouteID) === routeId) {
          const m = r.RouteMapImageUrl?.match(/nid=([0-9A-Za-z]+)/);
          if (m) {
            nidCache.set(routeId, { nid: m[1], fetchedAt: Date.now() });
            return m[1];
          }
        }
      }
    } catch { /* try next city */ }
  }

  nidCache.set(routeId, { nid: null, fetchedAt: Date.now() });
  return null;
}

/**
 * Returns real-time estimates for `ourStops` using ebus.gov.taipei as the data source.
 * Stops are matched by exact lat/lon coordinate (both systems share the same coordinates).
 */
export async function getEbusEstimates(
  nid: string,
  ourStops: Stop[],
): Promise<EstimateTime[]> {
  // Refresh page data (CSRF token + stop list) if stale
  let pageData = pageCache.get(nid);
  if (!isFresh(pageData?.fetchedAt, PAGE_CACHE_MS)) {
    pageData = await fetchPageData(nid);
    pageCache.set(nid, pageData);
  }

  // Refresh estimates if stale, with automatic token retry
  let estData = estimateCache.get(nid);
  if (!isFresh(estData?.fetchedAt, ESTIMATE_CACHE_MS)) {
    try {
      const data = await fetchStopStatuses(nid, pageData.token, pageData.cookieHeader);
      estData = { data, fetchedAt: Date.now() };
      estimateCache.set(nid, estData);
    } catch {
      // Token may have expired — refresh page data and retry once
      pageData = await fetchPageData(nid);
      pageCache.set(nid, pageData);
      const data = await fetchStopStatuses(nid, pageData.token, pageData.cookieHeader);
      estData = { data, fetchedAt: Date.now() };
      estimateCache.set(nid, estData);
    }
  }

  // Build lookup: uniStopId → EbusStop
  const ebusById = new Map<string, EbusStop>(
    pageData.stops.map((s) => [s.uniStopId, s]),
  );

  // Build lookup: "lat:lon" → our Stop (exact string coordinate match)
  const ourByCoord = new Map<string, Stop>();
  for (const stop of ourStops) {
    ourByCoord.set(`${stop.latitude}:${stop.longitude}`, stop);
  }

  // ebus sentinel ETA values meaning "no service" (0xFFFF family)
  const NO_SERVICE_THRESHOLD = 65500;

  const result: EstimateTime[] = [];
  for (const est of estData.data) {
    // Skip sentinel/no-service values
    if (est.ETA >= NO_SERVICE_THRESHOLD) continue;

    const ebusStop = ebusById.get(est.UniStationId);
    if (!ebusStop) continue;

    const ourStop = ourByCoord.get(`${ebusStop.lat}:${ebusStop.lon}`);
    if (!ourStop) continue;

    result.push({
      RouteID: ourStop.routeId,
      StopID: ourStop.Id,
      EstimateTime: String(est.ETA),
      GoBack: ourStop.goBack,
    });
  }

  return result;
}
