// main.ts
import { Hono } from "npm:hono";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { createAuthRoutes } from "./routes/auth.ts";
import { createBlocksRoutes } from "./routes/blocks.ts";
import { createWorldsRoutes } from "./routes/worlds.ts";
import { getCookie } from "npm:hono/cookie";

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

// Origin-based HTML override
app.use(async (c, next) => {
  const origin = c.req.header("origin") || c.req.header("host") || "";
  if (origin.includes("turfbuddy.land")) {
    const html = await Deno.readTextFile("./public/turfbuddy.html");
    return c.html(html);
  }
  await next();
});

// Mount route modules
app.route("/api/auth", createAuthRoutes(supabase));
app.route("/worlds", createWorldsRoutes(supabase));
app.route("/blocks", createBlocksRoutes());

// PUBLIC static files
app.use("/api/auth/*", (c, next) => next());
app.use("/assets/*", (c, next) => next());
app.use("/blocks/*", (c, next) => next());
app.use("/login", (c, next) => next());

// Origin-based HTML override
app.use(async (c, next) => {
  const origin = c.req.header("origin") || c.req.header("host") || "";
  if (origin.includes("turfbuddy.land")) {
    const html = await Deno.readTextFile("./public/turfbuddy.html");
    return c.html(html);
  }
  await next();
});

// Middleware: refresh access token if expired
app.use(async (c, next) => {
  const refreshToken = getCookie(c, "playground_refresh_token");
  const expiresAt = Number(getCookie(c, "playground_expires_at"));
  // If no access token, skip
  if (!refreshToken || !expiresAt) return next();
  // If expired, refresh
  if (Date.now() / 1000 > expiresAt) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      // Clear cookies and return 401
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
      return c.json({ error: "Session expired" }, 401);
    }
    const session = data.session;
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
  }
  await next();
});

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
