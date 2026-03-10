import { serve, file } from "bun";

const PORT = 3000;
const HOST = "localhost";

serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === "/") {
      return new Response(file("index.html"));
    }
    
    if (url.pathname === "/dist/index.js") {
      return new Response(file("dist/index.js"), {
        headers: { "Content-Type": "application/javascript" },
      });
    }
    
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\x1b[32mACCESS TERMINAL:\x1b[0m http://${HOST}:${PORT}/\n`);
