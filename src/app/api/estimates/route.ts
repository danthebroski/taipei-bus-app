import { NextRequest, NextResponse } from 'next/server';
import { getEstimates, getEstimatesForRoute } from '@/lib/bus-api';

export async function GET(request: NextRequest) {
  try {
    const routeId = request.nextUrl.searchParams.get('routeId');

    // When routeId is provided, use the smart fetcher that tries TDX on-demand
    if (routeId) {
      const estimates = await getEstimatesForRoute(parseInt(routeId, 10));
      return NextResponse.json(estimates);
    }

    // Bulk: return all TPE/NTPC estimates
    const estimates = await getEstimates();
    return NextResponse.json(estimates);
  } catch (e) {
    console.error('Failed to fetch estimates:', e);
    return NextResponse.json({ error: 'Failed to fetch estimates' }, { status: 500 });
  }
}
