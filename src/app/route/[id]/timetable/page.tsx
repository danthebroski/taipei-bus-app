'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Route } from '@/lib/types';
import { formatBusTime, formatHeadway, getCurrentPeriod, Period } from '@/lib/format-time';

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

/** Derive a short, meaningful tab label from a pathAttributeName. */
function getDirLabel(name: string, routeNameZh: string, index: number): string {
  const fallback = index === 0 ? '去程' : '返程';
  if (!name || name === routeNameZh) return fallback;

  // Extract parenthetical: "承德幹線(北投-市府)" → "北投→市府"
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].replace(/-/g, '→');

  // Strip route name prefix + leading separators
  const stripped = name.startsWith(routeNameZh)
    ? name.slice(routeNameZh.length).replace(/^[_\-\s]+/, '').trim()
    : name;

  return stripped || fallback;
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
  const [currentPeriod, setCurrentPeriod] = useState<Period>(getCurrentPeriod);

  useEffect(() => {
    fetch(`/api/timetable?routeId=${id}`)
      .then((r) => r.json())
      .then((d: TimetableData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Update period every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentPeriod(getCurrentPeriod()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const route = data?.route;
  const directions = data?.directions ?? [];
  const hasMultipleDirections = directions.length >= 2;
  const activeDirData = directions[activeDir] ?? directions[0];

  const realTimeUrl = `/route/${id}?name=${encodeURIComponent(routeName)}`;

  const hasHeadway = !!(route?.peakHeadway || route?.offPeakHeadway);

  const periods: {
    key: Period;
    label: string;
    timeDesc: string;
    headway: string | undefined;
    note?: string;
  }[] = [
    {
      key: 'peak',
      label: '尖峰',
      timeDesc: '平日 07:00–09:00、16:30–19:00',
      headway: route?.peakHeadway,
    },
    {
      key: 'offpeak',
      label: '離峰',
      timeDesc: '平日其他時段',
      headway: route?.offPeakHeadway,
    },
    {
      key: 'holiday',
      label: '例假日',
      timeDesc: '週末及例假日',
      headway: route?.holidayOffPeakHeadway || route?.holidayPeakHeadway || route?.offPeakHeadway,
      note: (!route?.holidayOffPeakHeadway && !route?.holidayPeakHeadway) ? '同離峰' : undefined,
    },
  ];

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
          <p className="text-sm text-gray-500">發車間隔</p>
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
        <div className="text-center py-12 text-gray-500">無法載入資料</div>
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
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors truncate ${
                    activeDir === i
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600'
                  }`}
                >
                  {getDirLabel(dir.name, route?.nameZh ?? routeName, i)}
                </button>
              ))}
            </div>
          )}

          {/* Direction name */}
          {activeDirData?.name && (
            <p className="text-xs text-gray-400 mb-3">{activeDirData.name}</p>
          )}

          {/* First / Last bus */}
          {route && (route.goFirstBusTime || route.goLastBusTime) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-4">
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                {route.goFirstBusTime && (
                  <div>
                    <span className="text-gray-400">首班車：</span>
                    {formatBusTime(activeDir === 0 ? route.goFirstBusTime : route.backFirstBusTime)}
                  </div>
                )}
                {route.goLastBusTime && (
                  <div>
                    <span className="text-gray-400">末班車：</span>
                    {formatBusTime(activeDir === 0 ? route.goLastBusTime : route.backLastBusTime)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Headway period cards */}
          {hasHeadway ? (
            <div className="space-y-3">
              {periods.map(({ key, label, timeDesc, headway, note }) => {
                if (!headway) return null;
                const isActive = currentPeriod === key;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border shadow-sm p-4 flex items-center gap-4 transition-colors ${
                      isActive
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-semibold text-base mb-0.5 flex items-center gap-2 ${
                          isActive ? 'text-white' : 'text-gray-800'
                        }`}
                      >
                        {label}
                        {isActive && (
                          <span className="text-xs font-normal bg-white/20 px-1.5 py-0.5 rounded-full">
                            現在時段
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-xs ${
                          isActive ? 'text-blue-100' : 'text-gray-400'
                        }`}
                      >
                        {timeDesc}
                        {note && (
                          <span className="ml-1 opacity-75">({note})</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`text-right shrink-0 ${
                        isActive ? 'text-white' : 'text-gray-800'
                      }`}
                    >
                      <div className="text-xl font-bold">
                        {formatHeadway(headway)}
                      </div>
                      <div
                        className={`text-xs ${
                          isActive ? 'text-blue-100' : 'text-gray-400'
                        }`}
                      >
                        一班
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-gray-400 text-sm">
              此路線無發車間隔資料
            </div>
          )}
        </>
      )}
    </main>
  );
}
