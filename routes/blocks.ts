// routes/blocks.ts
import { Hono } from "npm:hono";

function wantsJson(c: any) {
  return c.req.header("accept")?.includes("application/json") ?? false;
}

export function createBlocksRoutes() {
  const app = new Hono();

  // ---------- JSON REST ----------

  // GET /blocks  (list packages)
  app.get("/", async (c, next) => {
    if (!wantsJson(c)) return next();

    const blockDirs: { name: string }[] = [];
    for await (const dirEntry of Deno.readDir("./blocks")) {
      if (dirEntry.isDirectory && dirEntry.name === "@playground") {
        blockDirs.unshift({ name: dirEntry.name });
      } else if (dirEntry.isDirectory) {
        blockDirs.push({ name: dirEntry.name });
      }
    }
    return c.json(blockDirs);
  });

  // GET /blocks/:pkg  (list files in pkg)
  app.get("/:pkg", async (c, next) => {
    if (!wantsJson(c)) return next();

    const pkg = c.req.param("pkg");
    const dirPath = `./blocks/${pkg}`;

    try {
      const files: { name: string; type: "block" | "mixin" | "app" }[] = [];

      for await (const dirEntry of Deno.readDir(dirPath)) {
        if (!dirEntry.isFile) continue;
        const n = dirEntry.name;

        const blockMatch = n.match(/^(.+)-block\.html$/);
        const mixinMatch = n.match(/^(.+)-mixin\.html$/);
        const appMatch = n.match(/^(.+)-app\.html$/);

        if (blockMatch) files.push({ name: blockMatch[1], type: "block" });
        else if (mixinMatch) files.push({ name: mixinMatch[1], type: "mixin" });
        else if (appMatch) files.push({ name: appMatch[1], type: "app" });
      }

      files.sort((a, b) => a.name.localeCompare(b.name));
      return c.json(files);
    } catch {
      return c.text("Not Found", 404);
    }
  });

  // GET /blocks/:pkg/:entity  (read file)
  app.get("/:pkg/:entity", async (c, next) => {
    if (!wantsJson(c)) return next();

    const pkg = c.req.param("pkg");
    const entity = c.req.param("entity");
    const filePath = `./blocks/${pkg}/${entity}`;

    try {
      const content = await Deno.readTextFile(filePath);
      return new Response(content, {
        headers: { "content-type": "text/plain" },
      });
    } catch {
      return c.text("Not Found", 404);
    }
  });

  // POST/PUT /blocks/:pkg/:entity  (write file)
  app.on(["POST", "PUT"], "/:pkg/:entity", async (c) => {
    const pkg = c.req.param("pkg");
    const entity = c.req.param("entity");

    if (!/^[a-z0-9]+(-[a-z0-9]+)*\-(block|mixin|app)\.html$/.test(entity)) {
      return c.text("Invalid name format", 400);
    }

    const body = await c.req.text();
    const filePath = `./blocks/${pkg}/${entity}`;
    await Deno.writeTextFile(filePath, body);

    return c.text("Saved", 200);
  });

  // DELETE /blocks/:pkg/:entity  (delete file)
  app.delete("/:pkg/:entity", async (c) => {
    const pkg = c.req.param("pkg");
    const entity = c.req.param("entity");
    const filePath = `./blocks/${pkg}/${entity}`;

    try {
      await Deno.remove(filePath);
      return c.text("Deleted", 200);
    } catch {
      return c.text("Not Found", 404);
    }
  });

  // ---------- Static / transforms ----------

  // /blocks/.../*.html -> raw HTML
  app.get("/*", async (c, next) => {
    const path = c.req.path; // because mounted at /blocks

    if (!path.endsWith(".html")) return next();

    try {
      const html = await Deno.readTextFile("." + path);
      return c.html(html);
    } catch {
      return next();
    }
  });

  // /blocks/... (no .html) -> JS wrapper around .html
  app.get("/*", async (c, next) => {
    const path = "/blocks" + c.req.path;

    if (path.endsWith(".html")) {
      return next();
    }

    try {
      let html = await Deno.readTextFile("." + path + ".html");
      if (!html) return c.text("Not Found", 404);

      const pkg = path.slice(8); // after "/blocks/"
      html = `<!--${JSON.stringify({ pkg })}-->\n` + html;

      return new Response(`export default ${JSON.stringify(html)};`, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      return c.notFound();
    }
  });

  return app;
}
