const { Hono } = require("hono");
const { logger } = require("hono/logger");
const { streamSSE } = require("hono/streaming");
const fs = require("fs");
const path = require("path");

const { login, listBorrowedBooks } = require("./modules/auth");
const { processBook, getLocalBooks } = require("./modules/processor");
const { BOOKS_DIR } = require("./modules/downloader");

const app = new Hono();

app.use("*", logger());

// Serve static frontend files (Optimized for Bun)
const htmlFile = Bun.file(path.join(__dirname, "index.html"));
app.get("/", async (c) => {
  return c.html(await htmlFile.text());
});

// API Routes
app.post("/api/logout", async (c) => {
  const tokenFile = path.join(__dirname, "..", "token.json");
  if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
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
  const tokenFile = path.join(__dirname, "..", "token.json");
  if (!fs.existsSync(tokenFile)) {
    return c.json({ success: false, message: "Not authenticated" }, 401);
  }

  const {
    data: { access_token },
  } = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
  try {
    const remoteBooks = await listBorrowedBooks(access_token);
    const localBooks = getLocalBooks();

    // Cross-reference
    const books = remoteBooks.map((rb) => {
      const normalize = (s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");
      const rbSafe = normalize(rb.book_title);

      const localBook = localBooks.find((lb) => normalize(lb.id) === rbSafe);

      return {
        ...rb,
        isLocal: !!localBook,
        safeName: localBook
          ? localBook.id
          : rb.book_title
              .trim()
              .replace(/[^a-z0-9_\-\.]/gi, "_")
              .replace(/_+/g, "_"),
        localFilename: localBook ? localBook.filename : null,
        localFormat: localBook ? localBook.format : null,
      };
    });

    return c.json({ success: true, books });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api/library", async (c) => {
  try {
    const localBooks = getLocalBooks();
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

app.post("/api/delete/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  const folderPath = path.join(BOOKS_DIR, safeName);

  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return c.json({ success: true });
  }
  return c.json({ success: false, message: "Folder not found" }, 404);
});

app.post("/api/open-folder/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  const folderPath = path.join(BOOKS_DIR, safeName);

  if (fs.existsSync(folderPath)) {
    // Bun's way to spawn processes
    Bun.spawn(["explorer", folderPath]);
    return c.json({ success: true });
  }
  return c.json({ success: false, message: "Folder not found" }, 404);
});

app.get("/api/files/:safeName/:filename", async (c) => {
  const { safeName, filename } = c.req.param();
  const filePath = path.join(BOOKS_DIR, safeName, filename);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    const contentType = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/epub+zip";

    return c.body(content, 200, {
      "Content-Type": contentType,
      "Content-Disposition": `inline`,
    });
  }

  return c.json({ success: false, message: "File not found" }, 404);
});

export default {
  port: 3000,
  fetch: app.fetch,
};
