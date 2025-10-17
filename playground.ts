const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/") {
    try {
      const html = await Deno.readTextFile("index.html");
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("index.html not found", { status: 404 });
    }
  }

  // Serve assets
  if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
    let filePath = "." + url.pathname;
    // If no extension, check for .html and wrap as JS module
    if (!filePath.match(/\.[a-zA-Z0-9]+$/)) {
      const htmlPath = filePath + ".html";
      try {
        const html = await Deno.readTextFile(htmlPath);
        const jsModule = `export default ${JSON.stringify(html)};\n`;
        return new Response(jsModule, {
          headers: { "content-type": "application/javascript" },
        });
      } catch {
        // Fall through to normal asset handling if .html not found
      }
    }
    try {
      const file = await Deno.readFile(filePath);
      // Basic content type detection
      let contentType = "application/octet-stream";
      if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
      else if (filePath.endsWith(".png")) contentType = "image/png";
      else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
        contentType = "image/jpeg";
      else if (filePath.endsWith(".gif")) contentType = "image/gif";
      else if (filePath.endsWith(".css")) contentType = "text/css";
      else if (
        filePath.endsWith(".js") ||
        filePath.endsWith(".mjs") ||
        filePath.endsWith(".cjs")
      )
        contentType = "application/javascript";
      return new Response(file, {
        headers: { "content-type": contentType },
      });
    } catch {
      return new Response("Asset not found", { status: 404 });
    }
  }
  return new Response("Not Found", { status: 404 });
};

Deno.serve(handler);
