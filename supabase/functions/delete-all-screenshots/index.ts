import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let totalDeleted = 0;
  const BATCH = 100;
  let hasMore = true;

  while (hasMore) {
    // Get a batch of file paths directly
    const { data: objects, error } = await supabase
      .from("objects" as any)
      .select("name")
      .eq("bucket_id", "screenshots")
      .limit(BATCH);

    // Fallback: use storage API to list from known user folders
    // Actually, let's use the storage.remove which accepts paths
    const { data: files } = await supabase.storage
      .from("screenshots")
      .list("", { limit: BATCH });

    if (!files || files.length === 0) {
      hasMore = false;
      break;
    }

    // These are top-level folders (user IDs)
    for (const folder of files) {
      if (folder.metadata) {
        // It's a file at root level
        await supabase.storage.from("screenshots").remove([folder.name]);
        totalDeleted++;
        continue;
      }

      // List contents of this user folder
      const { data: subItems } = await supabase.storage
        .from("screenshots")
        .list(folder.name, { limit: 1000 });

      if (!subItems) continue;

      for (const sub of subItems) {
        if (sub.metadata) {
          await supabase.storage.from("screenshots").remove([`${folder.name}/${sub.name}`]);
          totalDeleted++;
          continue;
        }

        // List recordings in competitor folder
        const { data: recordings } = await supabase.storage
          .from("screenshots")
          .list(`${folder.name}/${sub.name}`, { limit: 1000 });

        if (recordings && recordings.length > 0) {
          // Batch delete in chunks of 100
          for (let i = 0; i < recordings.length; i += 100) {
            const batch = recordings.slice(i, i + 100);
            const paths = batch.map(r => `${folder.name}/${sub.name}/${r.name}`);
            await supabase.storage.from("screenshots").remove(paths);
            totalDeleted += paths.length;
          }
        }
      }
    }

    // Check if there are still files
    const { data: remaining } = await supabase.storage
      .from("screenshots")
      .list("", { limit: 1 });
    hasMore = !!(remaining && remaining.length > 0);
  }

  // Delete DB records
  const { error: dbError } = await supabase.from("screenshots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: compError } = await supabase.from("competitors").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  return new Response(
    JSON.stringify({ success: true, totalDeleted, dbError: dbError?.message, compError: compError?.message }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
