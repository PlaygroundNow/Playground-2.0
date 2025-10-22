import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

Deno.serve(async (req) => {
  const { pathname } = new URL(req.url);

  // REST application/json
  if (req.headers.get("accept")?.includes("application/json")) {
    if (pathname === "/blocks") {
      return Response.json([{ name: "@playground" }]);
    }

    if (pathname === "/blocks/@playground") {
      const files = [];
      for await (const dirEntry of Deno.readDir("./blocks/@playground")) {
        if (dirEntry.isFile) {
          const blockMatch = dirEntry.name.match(/^(.+)-block\.html$/);
          const mixinMatch = dirEntry.name.match(/^(.+)-mixin\.html$/);

          if (blockMatch) {
            const [, name] = blockMatch;
            files.push({ name, type: "block" });
          } else if (mixinMatch) {
            const [, name] = mixinMatch;
            files.push({ name, type: "mixin" });
          }
        }
      }
      files.sort((a, b) => a.name.localeCompare(b.name));
      return Response.json(files);
    }

    if (pathname.startsWith("/blocks/@playground/")) {
      const entity = pathname.replace("/blocks/@playground/", "");
      const filePath = `./blocks/@playground/${entity}`;

      switch (req.method) {
        case "GET": {
          try {
            const content = await Deno.readTextFile(filePath);
            return new Response(content, {
              headers: { "content-type": "text/plain" },
            });
          } catch {
            return new Response("Not Found", { status: 404 });
          }
        }
        case "POST":
        case "PUT": {
          if (!/^[a-z0-9]+(-[a-z0-9]+)*\-(block|mixin)\.html$/.test(entity)) {
            return new Response("Invalid name format", { status: 400 });
          }

          const body = await req.text();
          await Deno.writeTextFile(filePath, body);
          return new Response("Saved", { status: 200 });
        }
        case "DELETE": {
          try {
            await Deno.remove(filePath);
            return new Response("Deleted", { status: 200 });
          } catch {
            return new Response("Not Found", { status: 404 });
          }
        }
        default:
          return new Response("Method Not Allowed", { status: 405 });
      }
    }
  }

  if (pathname.startsWith("/blocks/") && pathname.endsWith(".html")) {
    try {
      const html = await Deno.readTextFile("." + pathname);
      return new Response(html, {
        headers: { "content-type": "text/html" },
      });
    } catch {
      // fallback to public
    }
  } else if (pathname.startsWith("/blocks/") && !pathname.endsWith(".html")) {
    try {
      let html = await Deno.readTextFile("." + pathname + ".html");
      if (!html) return new Response("Not Found", { status: 404 });

      const pkg = pathname.slice(8);
      html = `<!--${JSON.stringify({ pkg })}-->` + "\n" + html;

      return new Response(
        `
        export * from "/assets/scripts/mixin.js?package=${pkg}";
        export default ${JSON.stringify(html)};
        `,
        {
          headers: { "content-type": "application/javascript" },
        }
      );
    } catch {
      // fallback to public
    }
  }

  return serveDir(req, { fsRoot: "./public", quiet: true });
});
