const { Hono } = require("hono");
const { logger: honoLogger } = require("hono/logger");
const path = require("path");

const authRoutes = require("./backend/routes/auth.routes");
const libraryRoutes = require("./backend/routes/library.routes");
const downloadRoutes = require("./backend/routes/download.routes");
const discoverRoutes = require("./backend/routes/discover.routes");
const { BOOKS_DIR } = require("./backend/config");
const logger = require("./backend/utils/logger");

const app = new Hono();

// Middleware
app.use("*", honoLogger());

// Serve static frontend files
app.get("/", async (c) => {
  const htmlFile = Bun.file(path.join(__dirname, "frontend", "index.html"));
  return c.html(await htmlFile.text());
});

app.get("/styles.css", (c) => {
  return new Response(Bun.file(path.join(__dirname, "frontend", "style.css")), {
    headers: { "Content-Type": "text/css" },
  });
});

app.get("/app.js", (c) => {
  return new Response(Bun.file(path.join(__dirname, "frontend", "app.js")), {
    headers: { "Content-Type": "application/javascript" },
  });
});

// Mount Modular API Routes
app.route("/api", authRoutes);
app.route("/api", libraryRoutes);
app.route("/api", downloadRoutes);
app.route("/api/discover", discoverRoutes);

// File & Media Routes (Keeping these in main server for now as they are simple pass-throughs)
app.get("/books/:safeName/cover.jpg", async (c) => {
  const file = Bun.file(path.join(BOOKS_DIR, c.req.param("safeName"), "cover.jpg"));
  if (await file.exists()) {
    return new Response(file, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000" },
    });
  }
  return c.json({ success: false, message: "Cover not found" }, 404);
});

app.get("/api/files/:safeName/:filename", async (c) => {
  const { safeName, filename } = c.req.param();
  const file = Bun.file(path.join(BOOKS_DIR, safeName, filename));
  if (await file.exists()) {
    const contentType = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/epub+zip";
    return new Response(file, { headers: { "Content-Type": contentType, "Content-Disposition": "inline" } });
  }
  return c.json({ success: false, message: "File not found" }, 404);
});

logger.info(`iPusnas Downloader server starting on port 3000...`);

export default {
  port: 3000,
  fetch: app.fetch,
  idleTimeout: 255,
};
