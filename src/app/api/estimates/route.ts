import { NextRequest, NextResponse } from 'next/server';
import { getEstimates } from '@/lib/bus-api';

export async function GET(request: NextRequest) {
  try {
    const routeId = request.nextUrl.searchParams.get('routeId');
    let estimates = await getEstimates();

    if (routeId) {
      estimates = estimates.filter((e) => e.RouteID === parseInt(routeId, 10));
    }

    return NextResponse.json(estimates);
  } catch (e) {
    console.error('Failed to fetch estimates:', e);
    return NextResponse.json({ error: 'Failed to fetch estimates' }, { status: 500 });
  }
}
