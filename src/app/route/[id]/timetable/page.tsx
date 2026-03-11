'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Route } from '@/lib/types';
import { formatBusTime, formatHeadway } from '@/lib/format-time';

interface TimetableDirection {
  pathAttributeId: number;
  name: string;
  schedule: {
    weekday: string[];
    saturday: string[];
    sunday: string[];
  };
}

interface TimetableData {
  route: Route | null;
  directions: TimetableDirection[];
}

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function TimeGrid({
  times,
  currentTime,
}: {
  times: string[];
  currentTime: string;
}) {
  if (times.length === 0) return null;

  // Find the index of the next departure at or after current time
  const nextIdx = times.findIndex((t) => t >= currentTime);

  return (
    <div className="flex flex-wrap gap-2">
      {times.map((time, i) => {
        const isPast = nextIdx === -1 || i < nextIdx;
        const isNext = i === nextIdx;
        return (
          <span
            key={`${time}-${i}`}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-mono ${
              isNext
                ? 'bg-blue-600 text-white font-bold'
                : isPast
                ? 'text-gray-300'
                : 'text-gray-700'
            }`}
          >
            {isNext && <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />}
            {time}
          </span>
        );
      })}
    </div>
  );
}

export default function TimetablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeName = searchParams.get('name') || '';
  const dirParam = searchParams.get('dir') || '0';

  const [data, setData] = useState<TimetableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeDir, setActiveDir] = useState(parseInt(dirParam, 10) || 0);
  const [currentTime, setCurrentTime] = useState(getCurrentTime);

  useEffect(() => {
    fetch(`/api/timetable?routeId=${id}`)
      .then((r) => r.json())
      .then((d: TimetableData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(getCurrentTime()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const route = data?.route;
  const directions = data?.directions ?? [];
  const hasMultipleDirections = directions.length >= 2;
  const activeDirData = directions[activeDir] ?? directions[0];

  const { weekday = [], saturday = [], sunday = [] } =
    activeDirData?.schedule ?? {};

  // Combine sat + sun as weekend
  const weekend = [...new Set([...saturday, ...sunday])].sort();
  const weekendDiffersFromWeekday = !arraysEqual(weekend, weekday);

  const hasSchedule = weekday.length > 0 || weekend.length > 0;
  const hasHeadway = !!(route?.peakHeadway || route?.offPeakHeadway);

  const realTimeUrl = `/route/${id}?name=${encodeURIComponent(routeName)}`;

  return (
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
            {routeName || route?.nameZh || id}
          </h1>
          <p className="text-sm text-gray-500">時刻表</p>
        </div>
        <a
          href={realTimeUrl}
          className="text-sm text-blue-500 hover:text-blue-700 shrink-0"
        >
          即時到站 &rsaquo;
        </a>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500">載入中...</div>
      )}

      {error && (
        <div className="text-center py-12 text-gray-500">無法載入時刻表</div>
      )}

      {!loading && !error && (
        <>
          {/* Direction Tabs */}
          {hasMultipleDirections && (
            <div className="flex bg-gray-200 rounded-lg p-0.5 mb-4">
              {directions.map((dir, i) => (
                <button
                  key={dir.pathAttributeId}
                  onClick={() => setActiveDir(i)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeDir === i
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600'
                  }`}
                >
                  {i === 0 ? '去程' : '返程'}
                </button>
              ))}
            </div>
          )}

          {/* Direction name */}
          {activeDirData?.name && (
            <p className="text-xs text-gray-400 mb-3">{activeDirData.name}</p>
          )}

          {/* Headway info */}
          {hasHeadway && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4 text-sm text-gray-600 grid grid-cols-2 gap-2">
              {route?.peakHeadway && (
                <div>
                  <span className="text-gray-400">尖峰：</span>每 {formatHeadway(route.peakHeadway)} 一班
                </div>
              )}
              {route?.offPeakHeadway && (
                <div>
                  <span className="text-gray-400">離峰：</span>每 {formatHeadway(route.offPeakHeadway)} 一班
                </div>
              )}
              {route?.goFirstBusTime && (
                <div>
                  <span className="text-gray-400">首班車：</span>
                  {formatBusTime(activeDir === 0 ? route.goFirstBusTime : route.backFirstBusTime)}
                </div>
              )}
              {route?.goLastBusTime && (
                <div>
                  <span className="text-gray-400">末班車：</span>
                  {formatBusTime(activeDir === 0 ? route.goLastBusTime : route.backLastBusTime)}
                </div>
              )}
            </div>
          )}

          {/* Schedule */}
          {hasSchedule ? (
            <div className="space-y-4">
              {weekday.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    平日
                  </h3>
                  <TimeGrid times={weekday} currentTime={currentTime} />
                </div>
              )}

              {weekendDiffersFromWeekday && weekend.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    例假日
                  </h3>
                  <TimeGrid times={weekend} currentTime={currentTime} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-gray-400 text-sm">
              此路線無時刻表資料
            </div>
          )}

          {/* Current time indicator */}
          {hasSchedule && (
            <p className="text-xs text-gray-400 text-center mt-4">
              目前時間 {currentTime}，藍色為下一班
            </p>
          )}
        </>
      )}
    </main>
  );
}
