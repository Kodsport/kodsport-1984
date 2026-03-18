import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller: only allow requests bearing the service role key
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    console.log(`Cleanup started. Cutoff date: ${sevenDaysAgo}`);

    // ─── Step A: Delete old screenshots (storage files + DB rows) ───

    const { data: oldScreenshots, error: ssErr } = await supabase
      .from("screenshots")
      .select("id, storage_path")
      .lt("captured_at", sevenDaysAgo);

    if (ssErr) throw new Error(`Failed to query old screenshots: ${ssErr.message}`);

    if (oldScreenshots && oldScreenshots.length > 0) {
      // Delete storage files in batches of 100
      const storagePaths = oldScreenshots.map((s: any) => s.storage_path);
      for (let i = 0; i < storagePaths.length; i += 100) {
        const batch = storagePaths.slice(i, i + 100);
        const { error: removeErr } = await supabase.storage
          .from("screenshots")
          .remove(batch);
        if (removeErr) {
          console.error(`Storage batch delete error: ${removeErr.message}`);
        }
      }

      // Delete DB rows
      const ssIds = oldScreenshots.map((s: any) => s.id);
      const { error: deleteErr } = await supabase
        .from("screenshots")
        .delete()
        .in("id", ssIds);
      if (deleteErr) {
        console.error(`Screenshot rows delete error: ${deleteErr.message}`);
      }

      console.log(`Deleted ${oldScreenshots.length} old screenshot(s).`);
    } else {
      console.log("No old screenshots to delete.");
    }

    // ─── Step B: Delete non-admin users older than 7 days ───

    // Fetch all users (paginate to handle > 1000)
    const allUsers: any[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });
      if (usersErr) throw new Error(`Failed to list users: ${usersErr.message}`);
      if (!users || users.length === 0) break;
      allUsers.push(...users);
      if (users.length < perPage) break;
      page++;
    }

    // Filter to users created > 7 days ago
    const oldUsers = allUsers.filter(
      (u: any) => new Date(u.created_at) < new Date(sevenDaysAgo)
    );

    if (oldUsers.length === 0) {
      console.log("No old users to evaluate.");
    }

    for (const user of oldUsers) {
      // Check if user is admin
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesErr) {
        console.error(`Failed to check roles for ${user.id}: ${rolesErr.message}`);
        continue;
      }

      const isAdmin = roles?.some((r: any) => r.role === "admin");
      if (isAdmin) {
        console.log(`Skipping admin user ${user.id}`);
        continue;
      }

      console.log(`Deleting non-admin user ${user.id} and associated data...`);

      // 1. Get their competitor records
      const { data: competitors } = await supabase
        .from("competitors")
        .select("id")
        .eq("user_id", user.id);

      if (competitors && competitors.length > 0) {
        const competitorIds = competitors.map((c: any) => c.id);

        // 2. Get their screenshots (for storage deletion)
        const { data: userScreenshots } = await supabase
          .from("screenshots")
          .select("id, storage_path")
          .in("competitor_id", competitorIds);

        if (userScreenshots && userScreenshots.length > 0) {
          // Delete storage files
          const paths = userScreenshots.map((s: any) => s.storage_path);
          for (let i = 0; i < paths.length; i += 100) {
            const batch = paths.slice(i, i + 100);
            await supabase.storage.from("screenshots").remove(batch);
          }

          // Delete screenshot rows
          await supabase
            .from("screenshots")
            .delete()
            .in("id", userScreenshots.map((s: any) => s.id));
        }

        // 3. Delete competitor rows
        await supabase
          .from("competitors")
          .delete()
          .eq("user_id", user.id);
      }

      // 4. Delete user_roles rows
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", user.id);

      // 5. Delete the auth user
      const { error: deleteUserErr } = await supabase.auth.admin.deleteUser(
        user.id
      );
      if (deleteUserErr) {
        console.error(`Failed to delete user ${user.id}: ${deleteUserErr.message}`);
      } else {
        console.log(`Successfully deleted user ${user.id}`);
      }
    }

    console.log("Cleanup completed successfully.");

    return new Response(
      JSON.stringify({ success: true, message: "Cleanup completed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
