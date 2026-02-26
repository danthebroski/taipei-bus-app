import { NextRequest, NextResponse } from 'next/server';
import { getRoutes } from '@/lib/bus-api';

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('q');
    const id = request.nextUrl.searchParams.get('id');
    let routes = await getRoutes();

    if (id) {
      routes = routes.filter((r) => r.Id === parseInt(id, 10));
    } else if (search) {
      const q = search.toLowerCase();
      routes = routes.filter(
        (r) =>
          r.nameZh.toLowerCase().includes(q) ||
          r.nameEn.toLowerCase().includes(q)
      );
    }

    return NextResponse.json(routes, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (e) {
    console.error('Failed to fetch routes:', e);
    return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}
