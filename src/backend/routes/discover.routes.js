/**
 * Modular discovery routes for the iPusnas Downloader.
 * Handles catalog search, book borrowing, and returns.
 */
const { Hono } = require("hono");
const { searchBooks, performBorrow, returnBook } = require("../services/book.service");
const { authMiddleware } = require("../middleware/auth.middleware");
const logger = require("../utils/logger");

const discoverRoutes = new Hono();

// Apply auth middleware to all discover routes
discoverRoutes.use("/*", authMiddleware);

// GET /api/discover/search
discoverRoutes.get("/search", async (c) => {
  const query = c.req.query("q");
  const offset = c.req.query("offset") || 0;
  const accessToken = c.get("accessToken");

  try {
    const result = await searchBooks(accessToken, query, offset);
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error(`Catalog search failed: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/discover/borrow
discoverRoutes.post("/borrow", async (c) => {
  const { bookId } = await c.req.json();
  const accessToken = c.get("accessToken");
  const userId = c.get("userId");

  try {
    const result = await performBorrow(accessToken, userId, bookId);
    logger.info(`Book borrowed: ${bookId} by user ${userId}`);
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error(`Borrow failed for book ${bookId}: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/discover/return
discoverRoutes.post("/return", async (c) => {
  const { borrowBookId } = await c.req.json();
  const accessToken = c.get("accessToken");

  try {
    const result = await returnBook(accessToken, borrowBookId);
    logger.info(`Book returned: ${borrowBookId}`);
    return c.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Return failed for ${borrowBookId}: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

module.exports = discoverRoutes;

