import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  
  let totalDeleted = 0;
  
  // Get all top-level folders
  const { data: topLevel } = await supabase.storage.from("screenshots").list("", { limit: 1000 });
  
  for (const folder of topLevel || []) {
    const prefix = folder.name;
    const { data: subs } = await supabase.storage.from("screenshots").list(prefix, { limit: 1000 });
    
    for (const sub of subs || []) {
      const subPath = `${prefix}/${sub.name}`;
      
      if (sub.metadata) {
        await supabase.storage.from("screenshots").remove([subPath]);
        totalDeleted++;
        continue;
      }
      
      // List and batch-delete files
      let offset = 0;
      while (true) {
        const { data: files } = await supabase.storage.from("screenshots").list(subPath, { limit: 500, offset });
        if (!files || files.length === 0) break;
        
        const paths = files.map(f => `${subPath}/${f.name}`);
        await supabase.storage.from("screenshots").remove(paths);
        totalDeleted += paths.length;
        
        if (files.length < 500) break;
        offset += 500;
      }
    }
    
    // Remove the folder itself if it's a file
    if (folder.metadata) {
      await supabase.storage.from("screenshots").remove([prefix]);
      totalDeleted++;
    }
  }

  return new Response(JSON.stringify({ success: true, totalDeleted }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
