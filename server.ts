import { serve } from "bun";

console.log("Open http://localhost:3000");

serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }
    if (url.pathname === "/dist/index.js") {
      return new Response(Bun.file("dist/index.js"), {
        headers: { "Content-Type": "application/javascript" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});
