export interface RecentRoute {
  Id: number;
  nameZh: string;
  departureZh: string;
  destinationZh: string;
}

const KEY = 'recentRoutes';
const MAX = 5;

export function getRecent(): RecentRoute[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function addRecent(route: RecentRoute): void {
  const updated = [route, ...getRecent().filter((r) => r.Id !== route.Id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(updated));
}

export function removeRecent(id: number): void {
  localStorage.setItem(KEY, JSON.stringify(getRecent().filter((r) => r.Id !== id)));
}
