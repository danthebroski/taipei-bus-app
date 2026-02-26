import { NextRequest, NextResponse } from 'next/server';
import { getStops, getEstimates, getRoutes } from '@/lib/bus-api';
import { formatEstimate } from '@/lib/estimate-utils';
import { NearbyStop } from '@/lib/types';

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  try {
    const lat = parseFloat(request.nextUrl.searchParams.get('lat') || '');
    const lon = parseFloat(request.nextUrl.searchParams.get('lon') || '');
    const radius = parseInt(request.nextUrl.searchParams.get('radius') || '300', 10);

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const [stops, estimates, routes] = await Promise.all([
      getStops(),
      getEstimates(),
      getRoutes(),
    ]);

    const routeMap = new Map(routes.map((r) => [r.Id, r]));
    const estimateMap = new Map(
      estimates.map((e) => [`${e.RouteID}-${e.StopID}-${e.GoBack}`, e.EstimateTime])
    );

    // Deduplicate by stopLocationId to avoid showing the same physical stop multiple times
    const nearbyStops: NearbyStop[] = [];
    const seenLocations = new Set<string>();

    for (const stop of stops) {
      const sLat = parseFloat(stop.latitude);
      const sLon = parseFloat(stop.longitude);
      if (isNaN(sLat) || isNaN(sLon)) continue;

      const dist = haversineDistance(lat, lon, sLat, sLon);
      if (dist > radius) continue;

      const key = `${stop.stopLocationId}-${stop.routeId}-${stop.goBack}`;
      if (seenLocations.has(key)) continue;
      seenLocations.add(key);

      const route = routeMap.get(stop.routeId);
      const estKey = `${stop.routeId}-${stop.Id}-${stop.goBack}`;
      const est = estimateMap.get(estKey);
      const { status, statusText, estimateMinutes } = formatEstimate(est);

      nearbyStops.push({
        ...stop,
        distance: Math.round(dist),
        routeName: route?.nameZh,
        estimateTime: est,
        estimateMinutes,
        status,
        statusText,
      });
    }

    nearbyStops.sort((a, b) => a.distance - b.distance);

    return NextResponse.json(nearbyStops.slice(0, 50));
  } catch (e) {
    console.error('Failed to fetch nearby stops:', e);
    return NextResponse.json({ error: 'Failed to fetch nearby' }, { status: 500 });
  }
}
