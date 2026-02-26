'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NearbyStop } from '@/lib/types';
import EstimateBadge from '@/components/EstimateBadge';
import PullToRefresh from '@/components/PullToRefresh';

export default function NearbyPage() {
  const router = useRouter();
  const [stops, setStops] = useState<NearbyStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [located, setLocated] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  const fetchNearby = useCallback(
    async (lat: number, lon: number) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/nearby?lat=${lat}&lon=${lon}&radius=300`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setStops(data);
        } else {
          setError('無法取得附近站牌資料');
        }
      } catch {
        setError('網路錯誤，請稍後再試');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError('您的瀏覽器不支援定位功能');
      return;
    }

    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setLocated(true);
        fetchNearby(latitude, longitude);
      },
      (err) => {
        setLoading(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('請允許位置權限以使用此功能');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('無法取得位置資訊');
            break;
          case err.TIMEOUT:
            setError('定位逾時，請重試');
            break;
          default:
            setError('定位失敗');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchNearby]);

  const handleRefresh = useCallback(async () => {
    if (coords) {
      await fetchNearby(coords.lat, coords.lon);
    }
  }, [coords, fetchNearby]);

  // Group by stop location
  const grouped = stops.reduce<Record<string, NearbyStop[]>>((acc, stop) => {
    const key = `${stop.stopLocationId}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(stop);
    return acc;
  }, {});

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <main className="max-w-lg mx-auto px-4 py-4 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors text-xl"
          >
            &larr;
          </button>
          <h1 className="text-2xl font-bold text-gray-800">附近站牌</h1>
        </div>

        {/* Locate button */}
        {!located && !loading && (
          <div className="text-center py-12">
            <button
              onClick={locate}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors shadow-md"
            >
              &#x1F4CD; 定位我的位置
            </button>
            <p className="text-sm text-gray-500 mt-3">
              將搜尋您周圍 300 公尺內的公車站
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-3xl mb-2 animate-pulse">&#x1F4CD;</div>
            定位中...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={locate}
              className="text-blue-600 font-medium"
            >
              重試
            </button>
          </div>
        )}

        {/* Results */}
        {located && !loading && stops.length === 0 && !error && (
          <div className="text-center py-8 text-gray-500">
            附近 300 公尺內沒有公車站
          </div>
        )}

        {Object.entries(grouped).map(([locId, locStops]) => {
          const first = locStops[0];
          return (
            <div
              key={locId}
              className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3 overflow-hidden"
            >
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="font-medium text-gray-700">
                  {first.nameZh}
                </span>
                <span className="text-sm text-gray-400">
                  {first.distance}m
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {locStops.map((stop) => (
                  <button
                    key={`${stop.Id}-${stop.goBack}`}
                    onClick={() =>
                      router.push(
                        `/route/${stop.routeId}?name=${encodeURIComponent(stop.routeName || '')}`
                      )
                    }
                    className="w-full flex items-center px-4 py-3 gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <span className="bg-blue-600 text-white px-2.5 py-0.5 rounded-lg font-bold text-sm min-w-[48px] text-center">
                      {stop.routeName || stop.routeId}
                    </span>
                    <span className="text-xs text-gray-400">
                      {stop.goBack === '0' ? '去' : '返'}
                    </span>
                    <div className="flex-1" />
                    <EstimateBadge
                      status={stop.status}
                      statusText={stop.statusText}
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </PullToRefresh>
  );
}
