'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Route, Stop, EstimateTime } from '@/lib/types';
import { formatEstimate } from '@/lib/estimate-utils';
import { formatBusTime, formatHeadway } from '@/lib/format-time';
import EstimateBadge from '@/components/EstimateBadge';
import CountdownTimer from '@/components/CountdownTimer';
import PullToRefresh from '@/components/PullToRefresh';

const REFRESH_INTERVAL = 15;

interface StopWithEstimate extends Stop {
  status: 'arriving' | 'soon' | 'waiting' | 'not-running';
  statusText: string;
  estimateMinutes?: number;
}

export default function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeName = searchParams.get('name') || '';

  const [route, setRoute] = useState<Route | null>(null);
  const [direction, setDirection] = useState<'0' | '1'>('0');
  const [stops, setStops] = useState<StopWithEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [noData, setNoData] = useState(false);

  // Fetch route info once
  useEffect(() => {
    fetch(`/api/routes?id=${id}`)
      .then((r) => r.json())
      .then((data: Route[]) => {
        if (data.length > 0) setRoute(data[0]);
      });
  }, [id]);

  // Fetch stops once
  const [rawStops, setRawStops] = useState<Stop[]>([]);
  const [stopsLoaded, setStopsLoaded] = useState(false);
  useEffect(() => {
    fetch(`/api/stops?routeId=${id}`)
      .then((r) => r.json())
      .then((data: Stop[]) => setRawStops(Array.isArray(data) ? data : []))
      .catch(() => setRawStops([]))
      .finally(() => setStopsLoaded(true));
  }, [id]);

  // Fetch estimates and merge
  const fetchEstimates = useCallback(async () => {
    setNoData(false);
    try {
      const res = await fetch(`/api/estimates?routeId=${id}`);
      const estimates: EstimateTime[] = await res.json();

      if (estimates.length === 0) {
        setNoData(true);
      }

      // Key by StopID only. NTPC estimates use GoBack '2'/'3' which never match
      // the direction strings '0'/'1', so including GoBack in the key drops most
      // NTPC estimates. Direction filtering happens below via stop.goBack.
      const estimateMap = new Map<number, string>();
      for (const e of estimates) {
        if (!estimateMap.has(e.StopID)) {
          estimateMap.set(e.StopID, e.EstimateTime);
        }
      }

      const dirStops = rawStops
        .filter((s) => s.goBack === direction)
        .sort((a, b) => a.seqNo - b.seqNo);

      const merged: StopWithEstimate[] = dirStops.map((stop) => {
        const est = estimateMap.get(stop.Id);
        const { status, statusText, estimateMinutes } = formatEstimate(est);
        return { ...stop, status, statusText, estimateMinutes };
      });

      setStops(merged);
    } finally {
      setLoading(false);
    }
  }, [id, rawStops, direction]);

  useEffect(() => {
    if (!stopsLoaded) return;
    if (rawStops.length > 0) {
      setLoading(true);
      fetchEstimates();
    } else {
      setLoading(false);
    }
  }, [stopsLoaded, rawStops, direction, fetchEstimates, refreshKey]);

  const handleRefresh = useCallback(async () => {
    await fetchEstimates();
  }, [fetchEstimates]);

  const handleTimerComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const directionLabel = direction === '0' ? '去程' : '返程';
  const otherDirection = direction === '0' ? '1' : '0';
  const departureLabel =
    direction === '0' ? route?.departureZh : route?.destinationZh;
  const destinationLabel =
    direction === '0' ? route?.destinationZh : route?.departureZh;

  const timetableUrl = `/route/${id}/timetable?name=${encodeURIComponent(routeName || route?.nameZh || '')}&dir=${direction}`;

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
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-blue-600">
              {routeName || route?.nameZh}
            </h1>
            {route && (
              <p className="text-sm text-gray-500">
                {route.departureZh} ↔ {route.destinationZh}
              </p>
            )}
          </div>
        </div>

        {/* Route Info */}
        {route && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4 text-sm text-gray-600">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-400">首班車：</span>
                {formatBusTime(direction === '0' ? route.goFirstBusTime : route.backFirstBusTime)}
              </div>
              <div>
                <span className="text-gray-400">末班車：</span>
                {formatBusTime(direction === '0' ? route.goLastBusTime : route.backLastBusTime)}
              </div>
              {route.peakHeadway && (
                <div>
                  <span className="text-gray-400">尖峰：</span>
                  {formatHeadway(route.peakHeadway)}
                </div>
              )}
              {route.offPeakHeadway && (
                <div>
                  <span className="text-gray-400">離峰：</span>
                  {formatHeadway(route.offPeakHeadway)}
                </div>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 text-right">
              <a
                href={timetableUrl}
                className="text-blue-500 hover:text-blue-700 text-xs"
              >
                時刻表 &rsaquo;
              </a>
            </div>
          </div>
        )}

        {/* Direction Toggle & Timer */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex bg-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setDirection('0')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                direction === '0'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              去程
            </button>
            <button
              onClick={() => setDirection('1')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                direction === '1'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              返程
            </button>
          </div>
          {!loading && (
            <CountdownTimer
              seconds={REFRESH_INTERVAL}
              onComplete={handleTimerComplete}
            />
          )}
        </div>

        {/* Direction label */}
        {departureLabel && destinationLabel && (
          <div className="text-sm text-gray-500 mb-3">
            {directionLabel}：{departureLabel} → {destinationLabel}
          </div>
        )}

        {/* No Real-Time Data Banner */}
        {!loading && noData && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 text-lg leading-none mt-0.5">&#x24D8;</span>
              <div>
                <p className="text-amber-800 font-medium text-sm">此路線目前無即時動態資訊</p>
                <a
                  href={timetableUrl}
                  className="inline-block mt-2 text-sm text-amber-700 underline hover:text-amber-900"
                >
                  查看時刻表
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Stops List */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">載入中...</div>
        ) : stops.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            此方向無站牌資料
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {stops.map((stop, i) => (
              <div
                key={stop.Id}
                className="flex items-center px-4 py-3 gap-3"
              >
                {/* Sequence indicator */}
                <div className="flex flex-col items-center w-6 shrink-0">
                  <div
                    className={`w-3 h-3 rounded-full border-2 ${
                      stop.status === 'arriving'
                        ? 'bg-green-500 border-green-500'
                        : stop.status === 'soon'
                        ? 'bg-yellow-500 border-yellow-500'
                        : 'bg-white border-gray-300'
                    }`}
                  />
                  {i < stops.length - 1 && (
                    <div className="w-0.5 h-4 bg-gray-200 mt-0.5" />
                  )}
                </div>

                {/* Stop name */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">
                    {stop.nameZh}
                  </div>
                </div>

                {/* Estimate */}
                <EstimateBadge
                  status={stop.status}
                  statusText={stop.statusText}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </PullToRefresh>
  );
}
