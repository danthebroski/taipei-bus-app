import { NextRequest, NextResponse } from 'next/server';
import { getEstimates, getRoutes, getStops } from '@/lib/bus-api';
import { getEbusEstimates, getEbusNId } from '@/lib/ebus-api';

// If fewer than this many estimates come back from the blob, try ebus.gov.taipei
const EBUS_FALLBACK_THRESHOLD = 20;

export async function GET(request: NextRequest) {
  try {
    const routeId = request.nextUrl.searchParams.get('routeId');
    let estimates = await getEstimates();

    if (routeId) {
      const id = parseInt(routeId, 10);
      estimates = estimates.filter((e) => e.RouteID === id);

      // If the blob returned suspiciously few estimates, try ebus.gov.taipei
      if (estimates.length < EBUS_FALLBACK_THRESHOLD) {
        try {
          const [routes, stops] = await Promise.all([getRoutes(), getStops()]);
          const route = routes.find((r) => r.Id === id);
          // NId is available for TPE routes from the blob; for NTPC routes, look it up via TDX
          const nid = route?.NId ?? (route ? await getEbusNId(id, route.nameZh) : null) ?? undefined;
          const routeStops = stops.filter((s) => s.routeId === id);

          if (nid && routeStops.length > 0) {
            const ebusEstimates = await getEbusEstimates(nid, routeStops);
            if (ebusEstimates.length > estimates.length) {
              estimates = ebusEstimates;
            }
          }
        } catch (e) {
          // ebus fallback failed — silently continue with blob estimates
          console.warn('ebus fallback failed for routeId', routeId, e);
        }
      }
    }

    return NextResponse.json(estimates);
  } catch (e) {
    console.error('Failed to fetch estimates:', e);
    return NextResponse.json({ error: 'Failed to fetch estimates' }, { status: 500 });
  }
}
