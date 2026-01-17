import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AdminAlert {
  type: 'devtools' | 'stopped';
  competitorId: string;
  competitorName: string;
  room: string;
  timestamp: number;
  message: string;
}

export const useAdminNotifications = () => {
  const { toast } = useToast();
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    }

    setNotificationPermission('denied');
    return false;
  }, []);

  // Show notification
  const showNotification = useCallback((alert: AdminAlert) => {
    // Always show toast
    toast({
      title: alert.type === 'devtools' ? '⚠️ Utvecklarverktyg upptäckta!' : '🛑 Inspelning stoppad!',
      description: alert.message,
      variant: 'destructive',
    });

    // Show browser notification if permitted
    if (Notification.permission === 'granted') {
      const icon = alert.type === 'devtools' ? '⚠️' : '🛑';
      const title = alert.type === 'devtools' 
        ? 'Utvecklarverktyg upptäckta!' 
        : 'Inspelning stoppad!';

      new Notification(title, {
        body: alert.message,
        icon: '/favicon.ico',
        tag: `alert-${alert.competitorId}-${alert.type}`,
        requireInteraction: true,
      });
    }
  }, [toast]);

  // Subscribe to admin alerts channel
  useEffect(() => {
    const channel = supabase.channel('admin-alerts', {
      config: {
        broadcast: { self: false },
      },
    });

    channel.on('broadcast', { event: 'alert' }, (payload) => {
      const alert = payload.payload as AdminAlert;
      showNotification(alert);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [showNotification]);

  return {
    notificationPermission,
    requestPermission,
  };
};
