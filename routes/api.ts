import { Hono } from "npm:hono";
import { getCookie } from "npm:hono/cookie";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HTTPException } from "npm:hono/http-exception";

export function createAPIRoutes(supabase: SupabaseClient) {
  const app = new Hono();

  app.post("/worlds", async (c) => {
    const access_token = getCookie(c, "playground_access_token")!;
    const refresh_token = getCookie(c, "playground_refresh_token")!;

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return c.json({ error: error.message }, 401);
    }

    const body = await c.req.json();

    if (!body.id) {
      throw new HTTPException(400, { message: "id not provided" });
    }

    await supabase.from("world").insert({
      user_id: data.user!.id,
      automerge_id: body.id,
    });

    return c.text("Ok");
  });

  app.patch("/worlds/:id", async (c) => {
    const access_token = getCookie(c, "playground_access_token")!;
    const refresh_token = getCookie(c, "playground_refresh_token")!;

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return c.json({ error: error.message }, 401);
    }

    const body = await c.req.json();

    // Update the world entry for the authenticated user and provided automerge_id
    const worldId = c.req.param("id");

    const { error: updateError } = await supabase
      .from("world")
      .update({
        // Add fields to update here, e.g. name, description, etc.
        slug: body.slug,
      })
      .eq("user_id", data.user!.id)
      .eq("automerge_id", worldId);

    if (updateError) {
      throw new HTTPException(500, { message: updateError.message });
    }

    return c.text("Ok");
  });

  app.get("/worlds", async (c) => {
    const access_token = getCookie(c, "playground_access_token")!;
    const refresh_token = getCookie(c, "playground_refresh_token")!;

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return c.json({ error: error.message }, 401);
    }

    const { data: worlds, error: worldsError } = await supabase
      .from("world")
      .select("*")
      .eq("user_id", data.user!.id);

    if (worldsError) {
      return c.json({ error: worldsError.message }, 500);
    }

    return c.json(worlds);
  });

  return app;
}
