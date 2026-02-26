'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  seconds: number;
  onComplete: () => void;
}

export default function CountdownTimer({ seconds, onComplete }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onComplete();
          return seconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds, onComplete]);

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <div className="relative w-5 h-5">
        <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
          <circle
            cx="10" cy="10" r="8"
            fill="none" stroke="#e5e7eb" strokeWidth="2"
          />
          <circle
            cx="10" cy="10" r="8"
            fill="none" stroke="#3b82f6" strokeWidth="2"
            strokeDasharray={`${(remaining / seconds) * 50.27} 50.27`}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span>{remaining}s 後更新</span>
    </div>
  );
}
