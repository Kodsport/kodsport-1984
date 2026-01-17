import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertPayload {
  type: "devtools" | "stopped";
  competitorName: string;
  room?: string;
  timestamp?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) {
      console.error("DISCORD_WEBHOOK_URL is not configured");
      return new Response(
        JSON.stringify({ error: "Discord webhook not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { type, competitorName, room, timestamp }: AlertPayload = await req.json();
    
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
      color: type === "devtools" ? 0xff0000 : 0xffa500, // Red for devtools, orange for stopped
      fields: [
        ...(room ? [{ name: "Room", value: room, inline: true }] : []),
        { name: "Time", value: timestamp || new Date().toISOString(), inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    console.log(`Sending Discord alert: ${type} for ${competitorName}`);

    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error("Discord API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send Discord notification" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Discord notification sent successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in discord-alert function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
