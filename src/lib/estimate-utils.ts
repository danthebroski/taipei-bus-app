export function formatEstimate(estimateTime: string | undefined): {
  status: 'arriving' | 'soon' | 'waiting' | 'not-running';
  statusText: string;
  estimateMinutes?: number;
} {
  if (!estimateTime) {
    return { status: 'not-running', statusText: '未提供資訊' };
  }

  const val = parseInt(estimateTime, 10);

  switch (val) {
    case -1:
      return { status: 'not-running', statusText: '尚未發車' };
    case -2:
      return { status: 'not-running', statusText: '交管不停靠' };
    case -3:
      return { status: 'not-running', statusText: '末班車已過' };
    case -4:
      return { status: 'not-running', statusText: '今日未營運' };
  }

  if (val < 0) {
    return { status: 'not-running', statusText: '未營運' };
  }

  const minutes = Math.floor(val / 60);

  if (minutes <= 1) {
    return { status: 'arriving', statusText: '即將進站', estimateMinutes: minutes };
  }
  if (minutes < 3) {
    return { status: 'arriving', statusText: `${minutes} 分`, estimateMinutes: minutes };
  }
  if (minutes <= 10) {
    return { status: 'soon', statusText: `${minutes} 分`, estimateMinutes: minutes };
  }
  return { status: 'waiting', statusText: `${minutes} 分`, estimateMinutes: minutes };
}
