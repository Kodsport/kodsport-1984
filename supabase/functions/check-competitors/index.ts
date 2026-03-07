import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_THRESHOLD_SECONDS = 60;

const recentlyProcessed = new Map<string, number>();
const DEDUP_WINDOW_MS = 60000;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT - ensure the caller is authenticated
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with anon key + their JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify user is an admin
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin role required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

    // Clean up old entries from dedup map
    const now = Date.now();
    for (const [id, timestamp] of recentlyProcessed.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        recentlyProcessed.delete(id);
      }
    }

    // Find competitors who are marked as 'online' but haven't sent a heartbeat recently
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_SECONDS * 1000).toISOString();

    const { data: staleCompetitors, error: fetchError } = await serviceClient
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
      const { error: updateError } = await serviceClient
        .from("competitors")
        .update({ status: "offline", ended_at: new Date().toISOString() })
        .eq("id", competitor.id)
        .eq("status", "online");

      if (updateError) {
        console.error(`Failed to update competitor ${competitor.id}:`, updateError);
        continue;
      }

      recentlyProcessed.set(competitor.id, now);
      console.log(`Marked competitor ${competitor.name} as offline`);

      if (discordWebhookUrl) {
        notifications.push(sendDiscordNotification(discordWebhookUrl, competitor));
      }
    }

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
      JSON.stringify({ error: "Internal server error" }),
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
      color: 0xffa500,
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
