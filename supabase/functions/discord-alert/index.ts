import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AlertPayload {
  type: "devtools" | "stopped";
  competitorId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = user.id;

    const { type, competitorId }: AlertPayload = await req.json();

    if (!type || !["devtools", "stopped"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid alert type" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use service role to look up competitor data server-side (don't trust client)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find the caller's active competitor record
    let query = serviceClient
      .from("competitors")
      .select("id, name, room, status, user_id")
      .eq("user_id", userId);

    if (competitorId) {
      query = query.eq("id", competitorId);
    }

    // For devtools, the competitor should be online; for stopped, they might just have gone offline
    if (type === "devtools") {
      query = query.eq("status", "online");
    }

    const { data: competitor, error: compError } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (compError || !competitor) {
      return new Response(
        JSON.stringify({ error: "No valid competitor record found for caller" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify the competitor belongs to the caller
    if (competitor.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const competitorName = competitor.name;
    const room = competitor.room || "Unknown";
    const timestamp = new Date().toISOString();

    // 1. Send Discord webhook notification
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (webhookUrl) {
      const emoji = type === "devtools" ? "🚨" : "⏹️";
      const title = type === "devtools"
        ? "DevTools Detected!"
        : "Screen Recording Stopped";
      const description = type === "devtools"
        ? `**${competitorName}** opened developer tools`
        : `**${competitorName}** stopped their screen recording`;

      const embed = {
        title: `${emoji} ${title}`,
        description,
        color: type === "devtools" ? 0xff0000 : 0xffa500,
        fields: [
          { name: "Room", value: room, inline: true },
          { name: "Time", value: timestamp, inline: true },
        ],
        timestamp,
      };

      const discordResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!discordResponse.ok) {
        console.error("Discord API error:", await discordResponse.text());
      } else {
        console.log("Discord notification sent for", competitorName);
      }
    }

    // 2. Broadcast admin-alerts via Realtime (server-side, not spoofable by clients)
    const adminChannel = serviceClient.channel("admin-alerts");
    await adminChannel.subscribe();

    adminChannel.send({
      type: "broadcast",
      event: "alert",
      payload: {
        type,
        competitorId: competitor.id,
        competitorName,
        room,
        timestamp: Date.now(),
        message: type === "devtools"
          ? `${competitorName} opened developer tools (Inspect Element)`
          : `${competitorName} stopped their screen recording`,
      },
    });

    // Clean up channel after sending
    setTimeout(() => serviceClient.removeChannel(adminChannel), 2000);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in discord-alert function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
