// routes/auth.ts
import { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function createAuthRoutes(supabase: SupabaseClient) {
  const app = new Hono();

  // POST /api/auth/set-session
  app.post("/set-session", async (c) => {
    const { access_token, refresh_token } = await c.req.json<{
      access_token: string;
      refresh_token: string;
      expires_at?: number;
    }>();

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error || !data.session) {
      return c.json({ error: error?.message }, 401);
    }

    const session = data.session;

    c.header("content-type", "application/json");
    c.header(
      "set-cookie",
      `playground_access_token=${session.access_token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`,
      { append: true }
    );
    c.header(
      "set-cookie",
      `playground_refresh_token=${
        session.refresh_token
      }; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`,
      { append: true }
    );
    c.header(
      "set-cookie",
      `playground_expires_at=${session.expires_at}; HttpOnly; Path=/; Max-Age=${
        60 * 60 * 24 * 30
      }; SameSite=Lax; Secure`,
      { append: true }
    );

    return c.json({ ok: true });
  });

  // GET /api/auth/logout
  app.get("/logout", (c) => {
    c.header("content-type", "application/json");
    c.header(
      "set-cookie",
      "playground_access_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure",
      { append: true }
    );
    c.header(
      "set-cookie",
      "playground_refresh_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure",
      { append: true }
    );
    c.header(
      "set-cookie",
      "playground_expires_at=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure",
      { append: true }
    );

    return c.json({ ok: true });
  });

  return app;
}
