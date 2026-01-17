import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'inactive';
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const statusConfig = {
    online: {
      label: 'Online',
      className: 'status-online',
    },
    offline: {
      label: 'Offline',
      className: 'status-offline',
    },
    inactive: {
      label: 'Inaktiv',
      className: 'status-inactive',
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.className,
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {config.label}
    </span>
  );
};