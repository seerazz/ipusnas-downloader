const { Hono } = require("hono");
const { logger } = require("hono/logger");
const { streamSSE } = require("hono/streaming");
const fs = require("fs/promises"); // Use fs/promises
const path = require("path");

const { login, listBorrowedBooks } = require("./modules/auth");
const { processBook } = require("./modules/processor");
const { getLocalBooks, getSyncedLibrary } = require("./modules/library");
const {
  searchBooks,
  getBookDetail,
  getEpustaka,
  borrowBook,
  performBorrow,
  returnBook,
} = require("./modules/discovery");
const { BOOKS_DIR, TOKEN_PATH, TEMP_DIR } = require("./config");

const app = new Hono();

app.use("*", logger());

// Serve static frontend files (Optimized for Bun)
const htmlFile = Bun.file(path.join(__dirname, "index.html"));
app.get("/", async (c) => {
  return c.html(await htmlFile.text());
});

// API Routes
app.post("/api/logout", async (c) => {
  try {
    await fs.unlink(TOKEN_PATH);
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

  if (!(await tokenFile.exists())) {
    return c.json({ success: false, message: "Not authenticated" }, 401);
  }

  try {
    const {
      data: { access_token },
    } = await tokenFile.json();

    const remoteBooks = await listBorrowedBooks(access_token);
    const books = await getSyncedLibrary(remoteBooks);

    return c.json({ success: true, books });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api/library", async (c) => {
  try {
    const tokenFile = Bun.file(TOKEN_PATH);
    let remoteBooks = [];

    // Try to get remote books for cover fallback
    if (await tokenFile.exists()) {
      try {
        const {
          data: { access_token },
        } = await tokenFile.json();
        remoteBooks = await listBorrowedBooks(access_token);
      } catch (e) {
        // If fetching remote books fails, continue with empty array
      }
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
      const result = await processBook(bookId, async (data) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "progress", ...data }) });
      });
      await stream.writeSSE({ data: JSON.stringify({ type: "complete", ...result }) });
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message: err.message }) });
    }
  });
});

app.post("/api/discover/return", async (c) => {
  try {
    const tokenFile = Bun.file(TOKEN_PATH);
    if (!(await tokenFile.exists())) {
      return c.json({ success: false, message: "Not logged in" }, 401);
    }
    const {
      data: { access_token },
    } = await tokenFile.json();
    const { borrowBookId } = await c.req.json();

    const result = await returnBook(access_token, borrowBookId);
    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api/downloads/active", (c) => {
  const { getActiveJobs } = require("./modules/processor");
  return c.json({ success: true, active: getActiveJobs() });
});

app.post("/api/downloads/cancel/:bookId", (c) => {
  const { cancelJob } = require("./modules/processor");
  const bookId = c.req.param("bookId");
  const result = cancelJob(bookId);
  if (result) {
    return c.json({ success: true, message: "Download cancelled" });
  } else {
    return c.json({ success: false, message: "Job not found" }, 404);
  }
});

app.post("/api/delete/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  const folderPath = path.join(BOOKS_DIR, safeName);

  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, message: "Folder not found" }, 404);
  }
});

app.get("/api/temp-size", async (c) => {
  const { getDirSize } = require("./modules/utils");
  const totalSize = await getDirSize(TEMP_DIR);
  const mb = (totalSize / (1024 * 1024)).toFixed(2);
  return c.json({ success: true, size: `${mb} MB`, bytes: totalSize });
});

app.post("/api/clear-temp", async (c) => {
  try {
    const files = await fs.readdir(TEMP_DIR);
    for (const file of files) {
      if (file === ".gitignore") continue; // keep gitignore
      await fs.rm(path.join(TEMP_DIR, file), { recursive: true, force: true });
    }
    return c.json({ success: true, count: files.length });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post("/api/open-folder/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  const folderPath = path.join(BOOKS_DIR, safeName);

  try {
    await fs.access(folderPath);
    // Bun's way to spawn processes
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

  if (!(await tokenFile.exists())) {
    return c.json({ success: false, message: "Not authenticated" }, 401);
  }

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

  if (!(await tokenFile.exists())) {
    return c.json({ success: false, message: "Not authenticated" }, 401);
  }

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

app.get("/books/:safeName/cover.jpg", async (c) => {
  const { safeName } = c.req.param();
  const coverPath = path.join(BOOKS_DIR, safeName, "cover.jpg");

  const file = Bun.file(coverPath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  return c.json({ success: false, message: "Cover not found" }, 404);
});

app.get("/api/files/:safeName/:filename", async (c) => {
  const { safeName, filename } = c.req.param();
  const filePath = path.join(BOOKS_DIR, safeName, filename);

  const file = Bun.file(filePath);
  if (await file.exists()) {
    const contentType = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/epub+zip";
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline`,
      },
    });
  }

  return c.json({ success: false, message: "File not found" }, 404);
});

export default {
  port: 3000,
  fetch: app.fetch,
  idleTimeout: 255, // 4+ minutes to handle long queues/downloads
};
