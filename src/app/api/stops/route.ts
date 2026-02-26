import { NextRequest, NextResponse } from 'next/server';
import { getStops } from '@/lib/bus-api';

export async function GET(request: NextRequest) {
  try {
    const routeId = request.nextUrl.searchParams.get('routeId');
    let stops = await getStops();

    if (routeId) {
      stops = stops.filter((s) => s.routeId === parseInt(routeId, 10));
    }

    return NextResponse.json(stops, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (e) {
    console.error('Failed to fetch stops:', e);
    return NextResponse.json({ error: 'Failed to fetch stops' }, { status: 500 });
  }
}
