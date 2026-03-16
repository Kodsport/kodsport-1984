import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Room {
  id: string;
  name: string;
  is_active: boolean;
}

export const useRooms = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: true });

    if (data && !error) {
      setRooms(data as Room[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const activeRooms = rooms.filter(r => r.is_active);
  const roomNames = activeRooms.map(r => r.name);

  return { rooms, activeRooms, roomNames, loading, refetch: fetchRooms };
};
