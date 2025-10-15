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
    const filePath = "." + url.pathname;
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
      else if (filePath.endsWith(".js")) contentType = "application/javascript";
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
