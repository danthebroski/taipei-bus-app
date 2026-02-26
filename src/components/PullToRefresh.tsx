'use client';

import { useRef, useState, useCallback, useEffect, ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const THRESHOLD = 60;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling || refreshing) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0) {
        setPullDistance(Math.min(diff * 0.5, 100));
      }
    },
    [pulling, refreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pulling, pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div ref={containerRef}>
      <div
        className="pull-indicator flex items-center justify-center overflow-hidden text-gray-400 text-sm"
        style={{ height: pullDistance > 0 ? pullDistance : 0 }}
      >
        {refreshing ? (
          <span className="animate-spin">&#8635;</span>
        ) : pullDistance >= THRESHOLD ? (
          '放開以重新整理'
        ) : pullDistance > 0 ? (
          '下拉重新整理'
        ) : null}
      </div>
      {children}
    </div>
  );
}
