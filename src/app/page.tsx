'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Route } from '@/lib/types';
import { RecentRoute, getRecent, addRecent, removeRecent } from '@/lib/recent-routes';

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);

  useEffect(() => {
    setRecentRoutes(getRecent());
  }, []);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/routes?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data.slice(0, 20) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const goToRoute = (route: Route) => {
    addRecent({
      Id: route.Id,
      nameZh: route.nameZh,
      departureZh: route.departureZh,
      destinationZh: route.destinationZh,
    });
    setRecentRoutes(getRecent());
    router.push(`/route/${route.Id}?name=${encodeURIComponent(route.nameZh)}`);
  };

  const handleRemove = (id: number) => {
    removeRecent(id);
    setRecentRoutes(getRecent());
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">台北公車即時到站</h1>
        <p className="text-sm text-gray-500 mt-1">查詢公車到站時間</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="輸入路線號碼，例如 307、藍38"
          value={query}
          onChange={(e) => search(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        {query && (
          <button
            onClick={() => search('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl"
          >
            &times;
          </button>
        )}
      </div>

      {/* Search Results */}
      {loading && (
        <div className="text-center py-4 text-gray-500">搜尋中...</div>
      )}

      {results.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-500 mb-2">搜尋結果</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
            {results.map((route) => (
              <button
                key={route.Id}
                onClick={() => goToRoute(route)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-lg font-bold text-base min-w-[60px] text-center">
                    {route.nameZh}
                  </span>
                  <span className="text-sm text-gray-600">
                    {route.departureZh} → {route.destinationZh}
                  </span>
                </div>
                <span className="text-gray-400">&rsaquo;</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Routes & Nearby */}
      {!query && (
        <>
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-500 mb-2">最近搜尋</h2>
            {recentRoutes.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-gray-400">
                <div className="text-3xl mb-2">&#x1F50D;</div>
                <div className="text-sm">搜尋公車路線開始使用</div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
                {recentRoutes.map((route) => (
                  <div key={route.Id} className="flex items-center px-4 py-3 gap-3">
                    <button
                      onClick={() =>
                        goToRoute({
                          Id: route.Id,
                          nameZh: route.nameZh,
                          departureZh: route.departureZh,
                          destinationZh: route.destinationZh,
                          nameEn: '',
                          goFirstBusTime: '',
                          goLastBusTime: '',
                          backFirstBusTime: '',
                          backLastBusTime: '',
                          peakHeadway: '',
                          offPeakHeadway: '',
                        })
                      }
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="bg-blue-600 text-white px-3 py-1 rounded-lg font-bold text-base min-w-[60px] text-center shrink-0">
                        {route.nameZh}
                      </span>
                      <span className="text-sm text-gray-600 truncate">
                        {route.departureZh} ↔ {route.destinationZh}
                      </span>
                    </button>
                    <button
                      onClick={() => handleRemove(route.Id)}
                      className="text-gray-300 hover:text-gray-500 text-xl leading-none p-1 shrink-0"
                      aria-label="移除"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nearby Stops Button */}
          <button
            onClick={() => router.push('/nearby')}
            className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">&#x1F4CD;</span>
            <div className="text-left">
              <div className="font-medium text-gray-800">附近站牌</div>
              <div className="text-sm text-gray-500">尋找 300 公尺內的公車站</div>
            </div>
            <span className="ml-auto text-gray-400">&rsaquo;</span>
          </button>
        </>
      )}
    </main>
  );
}
