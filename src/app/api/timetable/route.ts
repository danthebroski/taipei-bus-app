import { NextRequest, NextResponse } from 'next/server';
import { getRoutes, getTimetable, getRawTpeRoutes } from '@/lib/bus-api';

function normalizeDepartureTime(time: string): string {
  if (!time) return '';
  // "HH:MM:SS" → "HH:MM"
  if (time.includes(':')) return time.slice(0, 5);
  // "HHMM" → "HH:MM"
  if (time.length === 4) return `${time.slice(0, 2)}:${time.slice(2)}`;
  return time;
}

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get('routeId');
  if (!routeId) {
    return NextResponse.json({ error: 'routeId required' }, { status: 400 });
  }

  const id = parseInt(routeId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'invalid routeId' }, { status: 400 });
  }

  try {
    const [routes, rawTpeRoutes, timetable] = await Promise.all([
      getRoutes(),
      getRawTpeRoutes(),
      getTimetable(),
    ]);

    const route = routes.find((r) => r.Id === id) ?? null;

    // Find all raw route entries matching routeId (may be 2: one per direction)
    const matchingRaw = rawTpeRoutes.filter((r) => r.Id === id);
    const pathAttributeIdSet = new Set(matchingRaw.map((r) => r.pathAttributeId));

    // Filter timetable entries for this route
    const relevantEntries = timetable.filter((t) =>
      pathAttributeIdSet.has(t.PathAttributeId)
    );

    // Build directions map: pathAttributeId → { name, entries }
    const directionsMap = new Map<
      number,
      { name: string; entries: typeof relevantEntries }
    >();
    for (const raw of matchingRaw) {
      if (!directionsMap.has(raw.pathAttributeId)) {
        directionsMap.set(raw.pathAttributeId, {
          name: raw.pathAttributeName,
          entries: [],
        });
      }
    }
    for (const entry of relevantEntries) {
      const dir = directionsMap.get(entry.PathAttributeId);
      if (dir) dir.entries.push(entry);
    }

    // Build response directions
    const directions = Array.from(directionsMap.entries()).map(
      ([pathAttributeId, { name, entries }]) => {
        // DateValue: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
        const toSortedUnique = (values: string[]) =>
          [...new Set(values.map(normalizeDepartureTime))].sort();

        const weekday = toSortedUnique(
          entries
            .filter((e) => ['2', '3', '4', '5', '6'].includes(e.DateValue))
            .map((e) => e.DepartureTime)
        );
        const saturday = toSortedUnique(
          entries.filter((e) => e.DateValue === '7').map((e) => e.DepartureTime)
        );
        const sunday = toSortedUnique(
          entries.filter((e) => e.DateValue === '1').map((e) => e.DepartureTime)
        );

        return {
          pathAttributeId,
          name,
          schedule: { weekday, saturday, sunday },
        };
      }
    );

    return NextResponse.json(
      { route, directions },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  } catch (e) {
    console.error('Failed to fetch timetable:', e);
    return NextResponse.json(
      { error: 'Failed to fetch timetable' },
      { status: 500 }
    );
  }
}
