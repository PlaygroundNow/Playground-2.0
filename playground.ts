import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

Deno.serve(async (req) => {
  const { pathname } = new URL(req.url);

  if (pathname.startsWith("/blocks/") && !/\.[a-z0-9]+$/i.test(pathname)) {
    try {
      const html = await Deno.readTextFile("./public" + pathname + ".html");
      return new Response(`export default ${JSON.stringify(html)};`, {
        headers: { "content-type": "application/javascript" },
      });
    } catch {
      // fallback to public
    }
  }

  return serveDir(req, { fsRoot: "./public", quiet: true });
});
