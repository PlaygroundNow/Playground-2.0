// main.ts
import { Hono } from "npm:hono";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { createAuthRoutes } from "./routes/auth.ts";
import { createBlocksRoutes } from "./routes/blocks.ts";
import { createWorldsRoutes } from "./routes/worlds.ts";

function parseCookies(req: Request) {
  const header = req.headers.get("cookie") ?? "";
  if (!header) return {};
  return Object.fromEntries(
    header.split(/;\s*/).map((v) => {
      const [k, ...rest] = v.split("=");
      return [k, rest.join("=")];
    })
  );
}

function isLoggedIn(req: Request) {
  const cookies = parseCookies(req);
  const access = cookies["playground_access_token"];
  const expiresRaw = cookies["playground_expires_at"];

  if (!access || !expiresRaw) return false;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return false;

  return expiresAt > now;
}

const supabase = createClient(
  "https://ifteoortevgzwvlbkjev.supabase.co",
  "sb_publishable_HVSLUqC4MdXCJzTbbJR24w_ylDOODOF"
);

const app = new Hono();

// Mount route modules
app.route("/api/auth", createAuthRoutes(supabase));
app.route("/worlds", createWorldsRoutes(supabase));
app.route("/blocks", createBlocksRoutes());

// PUBLIC static files
app.use("/api/auth/*", (c, next) => next());
app.use("/assets/*", (c, next) => next());
app.use("/blocks/*", (c, next) => next());
app.use("/login", (c, next) => next());

app.use("*", async (c, next) => {
  c.req.path;
  if (c.req.path.startsWith("/assets") || c.req.path.endsWith(".html")) {
    return next();
  }

  if (!isLoggedIn(c.req.raw)) {
    const html = await Deno.readTextFile("./public/login.html");
    return c.html(html);
  }

  if (c.req.path === "/") {
    return c.redirect("/worlds");
  }

  return next();
});

// Fallback: static public
app.all("*", (c) => {
  return serveDir(c.req.raw, { fsRoot: "./public", quiet: true });
});

Deno.serve(app.fetch);
