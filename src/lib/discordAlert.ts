import { supabase } from '@/integrations/supabase/client';

interface DiscordAlertPayload {
  type: 'devtools' | 'stopped';
  competitorName: string;
  room?: string;
}

export const sendDiscordAlert = async (payload: DiscordAlertPayload): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('discord-alert', {
      body: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    });

    if (error) {
      console.error('Failed to send Discord alert:', error);
    }
  } catch (err) {
    console.error('Discord alert error:', err);
  }
};
