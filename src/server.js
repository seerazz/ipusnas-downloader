const { Hono } = require("hono");
const { logger } = require("hono/logger");
const { streamSSE } = require("hono/streaming");
const fs = require("fs/promises");
const path = require("path");

const { login, listBorrowedBooks } = require("./backend/core/auth");
const { queueDownload, cancelJob, getQueueStatus } = require("./backend/services/download.service");
const { getLocalBooks, getSyncedLibrary } = require("./backend/services/library.service");
const { searchBooks, performBorrow, returnBook } = require("./backend/services/book.service");
const { BOOKS_DIR, TOKEN_PATH, TEMP_DIR, CACHE_FILE } = require("./backend/config");
const { getDirStats } = require("./backend/utils/file.utils");

const app = new Hono();

app.use("*", logger());

// Serve static frontend files
app.get("/", async (c) => {
  const htmlFile = Bun.file(path.join(__dirname, "frontend", "index.html"));
  return c.html(await htmlFile.text());
});

app.get("/styles.css", async (c) => {
  const cssFile = Bun.file(path.join(__dirname, "frontend", "style.css"));
  return new Response(cssFile, { headers: { "Content-Type": "text/css" } });
});

app.get("/app.js", async (c) => {
  const jsFile = Bun.file(path.join(__dirname, "frontend", "app.js"));
  return new Response(jsFile, { headers: { "Content-Type": "application/javascript" } });
});

// API Routes
app.post("/api/logout", async (c) => {
  try {
    const tokenFile = Bun.file(TOKEN_PATH);
    if (await tokenFile.exists()) {
      await tokenFile.delete();
    }
  } catch (e) {}
  return c.json({ success: true });
});

app.post("/api/login", async (c) => {
  const { email, password } = await c.req.json();
  try {
    const data = await login(email, password);
    return c.json({ success: true, user: data.data });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 401);
  }
});

app.get("/api/books", async (c) => {
  const tokenFile = Bun.file(TOKEN_PATH);
  if (!(await tokenFile.exists())) return c.json({ success: false, message: "Not authenticated" }, 401);
  try {
    const tokenData = await tokenFile.json();
    const {
      data: { access_token },
    } = tokenData;

    const remoteBooks = await listBorrowedBooks(access_token);
    const books = await getSyncedLibrary(remoteBooks);

    return c.json({
      success: true,
      books,
      user: {
        name: tokenData.data.name,
        email: tokenData.data.username || tokenData.data.email,
      },
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api/library", async (c) => {
  try {
    const tokenFile = Bun.file(TOKEN_PATH);
    let remoteBooks = [];
    if (await tokenFile.exists()) {
      try {
        const {
          data: { access_token },
        } = await tokenFile.json();
        remoteBooks = await listBorrowedBooks(access_token);
      } catch (e) {}
    }
    const localBooks = await getLocalBooks(remoteBooks);
    return c.json({ success: true, books: localBooks });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/download/:bookId", async (c) => {
  const bookId = c.req.param("bookId");
  return streamSSE(c, async (stream) => {
    try {
      const result = await queueDownload(bookId, async (data) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "progress", ...data }) });
      });
      await stream.writeSSE({ data: JSON.stringify({ type: "complete", ...result }) });
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message: err.message }) });
    }
  });
});

app.get("/api/downloads/active", (c) => {
  return c.json({ success: true, ...getQueueStatus() });
});

app.post("/api/downloads/cancel/:bookId", (c) => {
  const bookId = c.req.param("bookId");
  if (cancelJob(bookId)) return c.json({ success: true, message: "Download cancelled" });
  return c.json({ success: false, message: "Job not found" }, 404);
});

app.post("/api/delete/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  try {
    const folderPath = path.join(BOOKS_DIR, safeName);
    try {
      await fs.stat(folderPath); // Robust folder existence check
      await fs.rm(folderPath, { recursive: true, force: true });
      return c.json({ success: true });
    } catch {
      return c.json({ success: false, message: "Folder not found" }, 404);
    }
  } catch {
    return c.json({ success: false, message: "Folder not found" }, 404);
  }
});

app.get("/api/temp-size", async (c) => {
  const stats = await getDirStats(TEMP_DIR);

  let cacheCount = 0;
  try {
    const cacheFile = Bun.file(CACHE_FILE);
    if (await cacheFile.exists()) {
      const cacheData = await cacheFile.json();
      cacheCount = Object.keys(cacheData).length;
    }
  } catch (e) {}

  return c.json({
    success: true,
    size: `${(stats.size / 1048576).toFixed(2)} MB`,
    bytes: stats.size,
    files: stats.count,
    cacheItems: cacheCount,
  });
});

app.post("/api/clear-temp", async (c) => {
  try {
    const glob = new Bun.Glob("*");
    let count = 0;
    for await (const file of glob.scan({ cwd: TEMP_DIR })) {
      if (file === ".gitignore") continue;
      const filePath = path.join(TEMP_DIR, file);
      // Robust recursive removal for temp items (could be files or dirs)
      await fs.rm(filePath, { recursive: true, force: true });
      count++;
    }
    return c.json({ success: true, count });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/open-folder/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  const folderPath = path.join(BOOKS_DIR, safeName);
  try {
    await fs.stat(folderPath);
    Bun.spawn(["explorer", folderPath]);
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, message: "Folder not found" }, 404);
  }
});

app.get("/api/discover/search", async (c) => {
  const query = c.req.query("q");
  const offset = c.req.query("offset") || 0;
  const tokenFile = Bun.file(TOKEN_PATH);
  if (!(await tokenFile.exists())) return c.json({ success: false, message: "Not authenticated" }, 401);
  try {
    const {
      data: { access_token },
    } = await tokenFile.json();
    const result = await searchBooks(access_token, query, offset);
    return c.json({ success: true, ...result });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/discover/borrow", async (c) => {
  const { bookId } = await c.req.json();
  const tokenFile = Bun.file(TOKEN_PATH);
  if (!(await tokenFile.exists())) return c.json({ success: false, message: "Not authenticated" }, 401);
  try {
    const {
      data: { access_token, id: user_id },
    } = await tokenFile.json();
    const result = await performBorrow(access_token, user_id, bookId);
    return c.json({ success: true, ...result });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/discover/return", async (c) => {
  const { borrowBookId } = await c.req.json();
  const tokenFile = Bun.file(TOKEN_PATH);
  if (!(await tokenFile.exists())) return c.json({ success: false, message: "Not authenticated" }, 401);
  try {
    const {
      data: { access_token },
    } = await tokenFile.json();
    const result = await returnBook(access_token, borrowBookId);
    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/books/:safeName/cover.jpg", async (c) => {
  const file = Bun.file(path.join(BOOKS_DIR, c.req.param("safeName"), "cover.jpg"));
  if (await file.exists())
    return new Response(file, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000" },
    });
  return c.json({ success: false, message: "Cover not found" }, 404);
});

app.get("/api/files/:safeName/:filename", async (c) => {
  const { safeName, filename } = c.req.param();
  const file = Bun.file(path.join(BOOKS_DIR, safeName, filename));
  if (await file.exists()) {
    const contentType = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/epub+zip";
    return new Response(file, { headers: { "Content-Type": contentType, "Content-Disposition": `inline` } });
  }
  return c.json({ success: false, message: "File not found" }, 404);
});

export default {
  port: 3000,
  fetch: app.fetch,
  idleTimeout: 255,
};
