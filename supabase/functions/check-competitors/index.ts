import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_THRESHOLD_SECONDS = 30; // Consider offline if no heartbeat for 30 seconds

// Track recently processed competitors to avoid duplicate notifications
// Key: competitor.id, Value: timestamp when processed
const recentlyProcessed = new Map<string, number>();
const DEDUP_WINDOW_MS = 60000; // Don't re-notify for same competitor within 60 seconds

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clean up old entries from dedup map
    const now = Date.now();
    for (const [id, timestamp] of recentlyProcessed.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        recentlyProcessed.delete(id);
      }
    }

    // Find competitors who are marked as 'online' but haven't sent a heartbeat recently
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_SECONDS * 1000).toISOString();

    const { data: staleCompetitors, error: fetchError } = await supabase
      .from("competitors")
      .select("id, name, room, last_seen, status")
      .eq("status", "online")
      .lt("last_seen", staleTime);

    if (fetchError) {
      console.error("Error fetching stale competitors:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch competitors" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!staleCompetitors || staleCompetitors.length === 0) {
      return new Response(
        JSON.stringify({ message: "No stale competitors found", checked: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Filter out recently processed competitors to avoid duplicate notifications
    const competitorsToProcess = staleCompetitors.filter(c => {
      const lastProcessed = recentlyProcessed.get(c.id);
      return !lastProcessed || (now - lastProcessed > DEDUP_WINDOW_MS);
    });

    if (competitorsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ message: "All stale competitors already processed recently", checked: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${competitorsToProcess.length} stale competitors to process`);

    const notifications: Promise<void>[] = [];

    for (const competitor of competitorsToProcess) {
      // Update status to offline
      const { error: updateError } = await supabase
        .from("competitors")
        .update({ status: "offline", ended_at: new Date().toISOString() })
        .eq("id", competitor.id)
        .eq("status", "online"); // Only update if still online (avoid race conditions)

      if (updateError) {
        console.error(`Failed to update competitor ${competitor.id}:`, updateError);
        continue;
      }

      // Mark as recently processed
      recentlyProcessed.set(competitor.id, now);

      console.log(`Marked competitor ${competitor.name} as offline`);

      // Send Discord notification if webhook is configured
      if (discordWebhookUrl) {
        notifications.push(sendDiscordNotification(discordWebhookUrl, competitor));
      }
    }

    // Wait for all Discord notifications to complete
    await Promise.allSettled(notifications);

    return new Response(
      JSON.stringify({ 
        message: "Stale competitors processed", 
        processed: competitorsToProcess.length,
        competitors: competitorsToProcess.map(c => c.name)
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in check-competitors function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

async function sendDiscordNotification(
  webhookUrl: string, 
  competitor: { name: string; room: string | null; last_seen: string | null }
): Promise<void> {
  try {
    const embed = {
      title: "⏹️ Screen Recording Stopped",
      description: `**${competitor.name}** stopped their screen recording (connection lost)`,
      color: 0xffa500, // Orange
      fields: [
        ...(competitor.room ? [{ name: "Room", value: competitor.room, inline: true }] : []),
        { name: "Last Seen", value: competitor.last_seen || "Unknown", inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      console.error("Discord notification failed:", await response.text());
    } else {
      console.log(`Discord notification sent for ${competitor.name}`);
    }
  } catch (err) {
    console.error("Error sending Discord notification:", err);
  }
}

serve(handler);
