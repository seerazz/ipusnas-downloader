/**
 * Modular library management routes for the iPusnas Downloader.
 * Handles local library scans, book deletion, and temporary file cleanup.
 */
const { Hono } = require("hono");
const fs = require("fs/promises");
const path = require("path");
const { getLocalBooks } = require("../services/library.service");
const { BOOKS_DIR, TEMP_DIR, CACHE_FILE } = require("../config");
const { getDirStats } = require("../utils/file.utils");
const { listBorrowedBooks } = require("../core/auth");
const { authMiddleware } = require("../middleware/auth.middleware");
const logger = require("../utils/logger");

const libraryRoutes = new Hono();

// GET /api/library - Protected with auth middleware
libraryRoutes.get("/library", authMiddleware, async (c) => {
  try {
    const accessToken = c.get("accessToken");
    let remoteBooks = [];

    try {
      remoteBooks = await listBorrowedBooks(accessToken);
    } catch (e) {
      logger.debug("Failed to fetch remote books for comparison");
    }

    const localBooks = await getLocalBooks(remoteBooks);
    return c.json({ success: true, books: localBooks });
  } catch (err) {
    logger.error(`Failed to fetch local library: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/delete/:safeName
libraryRoutes.post("/delete/:safeName", async (c) => {
  const safeName = c.req.param("safeName");
  try {
    const folderPath = path.join(BOOKS_DIR, safeName);
    await fs.stat(folderPath);
    await fs.rm(folderPath, { recursive: true, force: true });
    logger.info(`Deleted book folder: ${safeName}`);
    return c.json({ success: true });
  } catch (err) {
    logger.warn(`Failed to delete folder ${safeName}: ${err.message}`);
    return c.json({ success: false, message: "Folder not found or deletion failed" }, 404);
  }
});

// GET /api/temp-size
libraryRoutes.get("/temp-size", async (c) => {
  try {
    const stats = await getDirStats(TEMP_DIR);
    let cacheCount = 0;
    try {
      const cacheFile = Bun.file(CACHE_FILE);
      if (await cacheFile.exists()) {
        const cacheData = await cacheFile.json();
        cacheCount = Object.keys(cacheData).length;
      }
    } catch (e) { }

    return c.json({
      success: true,
      size: `${(stats.size / 1048576).toFixed(2)} MB`,
      bytes: stats.size,
      files: stats.count,
      cacheItems: cacheCount,
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/clear-temp
libraryRoutes.post("/clear-temp", async (c) => {
  try {
    const glob = new Bun.Glob("*");
    let count = 0;
    for await (const file of glob.scan({ cwd: TEMP_DIR })) {
      if (file === ".gitignore") continue;
      const filePath = path.join(TEMP_DIR, file);
      await fs.rm(filePath, { recursive: true, force: true });
      count++;
    }
    logger.info(`Cleared ${count} entries from temp directory`);
    return c.json({ success: true, count });
  } catch (err) {
    logger.error(`Failed to clear temp: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/open-folder/:safeName
libraryRoutes.post("/open-folder/:safeName", async (c) => {
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

module.exports = libraryRoutes;
