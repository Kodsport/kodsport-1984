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

  // List all files in the screenshots bucket
  const { data: files, error: listError } = await supabase.storage
    .from("screenshots")
    .list("", { limit: 10000 });

  if (listError) {
    return new Response(JSON.stringify({ error: listError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Files are in user_id/competitor_id/ folders, so we need to list recursively
  // First get all top-level folders (user IDs)
  let totalDeleted = 0;

  for (const folder of files || []) {
    if (folder.id) continue; // skip actual files at root
    
    const { data: subFolders } = await supabase.storage
      .from("screenshots")
      .list(folder.name, { limit: 10000 });

    for (const subFolder of subFolders || []) {
      if (subFolder.id) {
        // It's a file, delete it
        await supabase.storage.from("screenshots").remove([`${folder.name}/${subFolder.name}`]);
        totalDeleted++;
        continue;
      }

      const { data: recordings } = await supabase.storage
        .from("screenshots")
        .list(`${folder.name}/${subFolder.name}`, { limit: 10000 });

      if (recordings && recordings.length > 0) {
        const paths = recordings.map(r => `${folder.name}/${subFolder.name}/${r.name}`);
        const { error: removeError } = await supabase.storage.from("screenshots").remove(paths);
        if (removeError) {
          console.error(`Error removing files: ${removeError.message}`);
        }
        totalDeleted += paths.length;
      }
    }
  }

  // Also delete all screenshot records from the database
  const { error: dbError } = await supabase.from("screenshots").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Delete all competitor records
  const { error: compError } = await supabase.from("competitors").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  return new Response(
    JSON.stringify({ success: true, totalDeleted, dbError: dbError?.message, compError: compError?.message }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
