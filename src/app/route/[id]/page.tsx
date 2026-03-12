'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Route, Stop, EstimateTime } from '@/lib/types';
import { formatEstimate } from '@/lib/estimate-utils';
import { formatBusTime, formatHeadway, getCurrentPeriod, Period } from '@/lib/format-time';
import EstimateBadge from '@/components/EstimateBadge';
import CountdownTimer from '@/components/CountdownTimer';
import PullToRefresh from '@/components/PullToRefresh';

const REFRESH_INTERVAL = 15;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const [currentPeriod, setCurrentPeriod] = useState<Period>(getCurrentPeriod);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearestStopId, setNearestStopId] = useState<number | null>(null);
  const nearestStopRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

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

  // Update period every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentPeriod(getCurrentPeriod()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Request geolocation once on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* permission denied or unavailable – silently ignore */ },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  // Find nearest stop in current direction when location or stops change
  // Only highlight if within 300m — otherwise the user isn't actually at a stop
  useEffect(() => {
    if (!userLocation || stops.length === 0) return;
    let minDist = 300; // 300m threshold
    let nearest: number | null = null;
    for (const stop of stops) {
      const lat = parseFloat(stop.latitude);
      const lng = parseFloat(stop.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;
      const d = haversineDistance(userLocation.lat, userLocation.lng, lat, lng);
      if (d < minDist) { minDist = d; nearest = stop.Id; }
    }
    setNearestStopId(nearest);
  }, [userLocation, stops]);

  // Reset scroll flag when direction changes
  useEffect(() => { scrolledRef.current = false; }, [direction]);

  // Jump to nearest stop once per direction (instant, after DOM settles)
  useEffect(() => {
    if (!nearestStopId || scrolledRef.current) return;
    const el = nearestStopRef.current;
    if (!el) return;
    scrolledRef.current = true;
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
    }, 150);
    return () => clearTimeout(timer);
  }, [nearestStopId, stops]);

  const handleRefresh = useCallback(async () => {
    await fetchEstimates();
  }, [fetchEstimates]);

  const handleTimerComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const directionLabel = direction === '0' ? '去程' : '返程';
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

        {/* Route Info: compact headway card */}
        {route && (() => {
          const allPeriods: { key: Period; label: string; headway: string | undefined }[] = [
            { key: 'peak', label: '尖峰', headway: route.peakHeadway },
            { key: 'offpeak', label: '離峰', headway: route.offPeakHeadway },
            {
              key: 'holiday',
              label: '例假日',
              headway: route.holidayOffPeakHeadway || route.holidayPeakHeadway || route.offPeakHeadway,
            },
          ].filter((p): p is { key: Period; label: string; headway: string } => !!p.headway);

          const activePeriod = allPeriods.find(p => p.key === currentPeriod);
          const inactivePeriods = allPeriods.filter(p => p.key !== currentPeriod);

          return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4">
              <div className="flex gap-4 text-xs text-gray-500 mb-2.5">
                <span>首班 {formatBusTime(direction === '0' ? route.goFirstBusTime : route.backFirstBusTime)}</span>
                <span>末班 {formatBusTime(direction === '0' ? route.goLastBusTime : route.backLastBusTime)}</span>
              </div>
              {allPeriods.length > 0 && (
                <div className="flex items-center gap-3">
                  {activePeriod && (
                    <div className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-2.5 py-1.5 shrink-0">
                      <span className="text-xs font-medium">{activePeriod.label}</span>
                      <span className="text-base font-bold">{formatHeadway(activePeriod.headway)}</span>
                    </div>
                  )}
                  {inactivePeriods.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      {inactivePeriods.map(p => (
                        <span key={p.key} className="text-xs text-gray-400">
                          {p.label}：{formatHeadway(p.headway)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
                  查看發車間隔
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
            {stops.map((stop, i) => {
              const isNearest = stop.Id === nearestStopId;
              return (
                <div
                  key={stop.Id}
                  ref={isNearest ? nearestStopRef : null}
                  className={`flex items-center px-4 py-3 gap-3 ${
                    isNearest ? 'bg-blue-50' : ''
                  }`}
                >
                  {/* Sequence indicator */}
                  <div className="flex flex-col items-center w-6 shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full border-2 ${
                        isNearest
                          ? 'bg-blue-500 border-blue-500'
                          : stop.status === 'arriving'
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
                    <div className={`font-medium truncate ${isNearest ? 'text-blue-700' : 'text-gray-800'}`}>
                      {stop.nameZh}
                    </div>
                    {isNearest && (
                      <div className="text-xs text-blue-500 mt-0.5">你在這</div>
                    )}
                  </div>

                  {/* Estimate */}
                  <EstimateBadge
                    status={stop.status}
                    statusText={stop.statusText}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </PullToRefresh>
  );
}
