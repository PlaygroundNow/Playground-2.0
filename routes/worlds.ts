import { Hono } from "npm:hono";
import { getCookie } from "npm:hono/cookie";
import { HTTPException } from "npm:hono/http-exception";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
/* import slugify from "npm:slugify";

import repo from "../utils/repo.ts"; */

export function createWorldsRoutes(supabase: SupabaseClient) {
  const app = new Hono();

  app.post("/", async (c) => {
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

  app.get("/", async (c) => {
    // If the request does not accept application/json, serve the HTML page
    if (!c.req.header("accept")?.includes("application/json")) {
      const html = await Deno.readTextFile("./public/worlds.html");
      return c.html(html);
    }

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

  app.get("/:world", async (c) => {
    /* const access_token = getCookie(c, "playground_access_token")!;
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

    for (let world of worlds) {
      try {
        const handle = await repo.find("automerge:" + world.automerge_id);
        console.log((slugify as any)((handle.doc() as any).name).toLowerCase());
      } catch (e) {
        //console.log(e);
      }
    } */

    const html = await Deno.readTextFile("./public/index.html");
    return c.html(html);
  });

  return app;
}
