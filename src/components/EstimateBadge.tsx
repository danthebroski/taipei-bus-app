'use client';

interface EstimateBadgeProps {
  status: 'arriving' | 'soon' | 'waiting' | 'not-running';
  statusText: string;
}

const statusStyles = {
  arriving: 'bg-green-100 text-green-700 border-green-300',
  soon: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  waiting: 'bg-gray-100 text-gray-600 border-gray-300',
  'not-running': 'bg-gray-50 text-gray-400 border-gray-200',
};

export default function EstimateBadge({ status, statusText }: EstimateBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[72px] px-3 py-1.5 rounded-lg border text-base font-bold ${statusStyles[status]}`}
    >
      {statusText}
    </span>
  );
}
