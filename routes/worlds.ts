import { Hono } from "npm:hono";
import { getCookie } from "npm:hono/cookie";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function createWorldsRoutes(supabase: SupabaseClient) {
  const app = new Hono();

  app.get("/", async (c) => {
    // If the request does not accept application/json, serve the HTML page
    const html = await Deno.readTextFile("./public/worlds.html");
    return c.html(html);
  });

  app.get("/:world", async (c) => {
    const access_token = getCookie(c, "playground_access_token")!;
    const refresh_token = getCookie(c, "playground_refresh_token")!;

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return c.json({ error: error.message }, 401);
    }

    const worldId = c.req.param("world");

    const { data: world, error: worldsError } = await supabase
      .from("world")
      .select("*")
      .eq("user_id", data.user!.id)
      .or(`automerge_id.eq.${worldId},slug.eq.${worldId}`)
      .single();

    if (worldsError) {
      return c.json({ error: worldsError.message }, 500);
    }

    let html = await Deno.readTextFile("./public/index.html");
    html = html.replace("{{ AUTOMERGE_ID }}", world.automerge_id);

    return c.html(html);
  });

  return app;
}
