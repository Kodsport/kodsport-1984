import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useRooms } from '@/hooks/useRooms';
import { Plus, DoorOpen, Pencil, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export const RoomManager = () => {
  const { rooms, loading, refetch } = useRooms();
  const [newRoomName, setNewRoomName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const addRoom = async () => {
    const name = newRoomName.trim();
    if (!name) return;

    setSaving(true);
    const { error } = await supabase.from('rooms').insert({ name } as any);
    setSaving(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    setNewRoomName('');
    refetch();
    toast({ title: 'Room added', description: `"${name}" has been created.` });
  };

  const renameRoom = async (id: string) => {
    const name = editName.trim();
    if (!name) return;

    setSaving(true);
    const { error } = await supabase.from('rooms').update({ name } as any).eq('id', id);
    setSaving(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    setEditingId(null);
    refetch();
    toast({ title: 'Room renamed', description: `Room renamed to "${name}".` });
  };

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    const { error } = await supabase
      .from('rooms')
      .update({ is_active: !currentlyActive } as any)
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    refetch();
    toast({
      title: currentlyActive ? 'Room deactivated' : 'Room activated',
      description: `Room has been ${currentlyActive ? 'deactivated' : 'activated'}.`,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <DoorOpen className="h-5 w-5 text-primary" />
          Manage Rooms
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new room */}
        <div className="flex gap-2">
          <Input
            placeholder="New room name..."
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRoom()}
            className="flex-1"
          />
          <Button onClick={addRoom} disabled={!newRoomName.trim() || saving} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Room list */}
        <div className="space-y-2">
          {rooms.map((room) => (
            <div
              key={room.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                room.is_active
                  ? 'border-border bg-card'
                  : 'border-border/50 bg-muted/30 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                {editingId === room.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameRoom(room.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-8"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => renameRoom(room.id)}
                      disabled={saving}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{room.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:opacity-100"
                      onClick={() => {
                        setEditingId(room.id);
                        setEditName(room.name);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {room.is_active ? 'Active' : 'Inactive'}
                </span>
                <Switch
                  checked={room.is_active}
                  onCheckedChange={() => toggleActive(room.id, room.is_active)}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Deactivated rooms are hidden from participants but historical data is preserved.
        </p>
      </CardContent>
    </Card>
  );
};
