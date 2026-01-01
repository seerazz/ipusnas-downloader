/**
 * Modular discovery routes for the iPusnas Downloader.
 * Handles catalog search, book borrowing, and returns.
 */
const { Hono } = require("hono");
const { searchBooks, performBorrow, returnBook } = require("../services/book.service");
const { TOKEN_PATH } = require("../config");
const logger = require("../utils/logger");

const discoverRoutes = new Hono();

// GET /api/discover/search
discoverRoutes.get("/search", async (c) => {
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
    logger.error(`Catalog search failed: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/discover/borrow
discoverRoutes.post("/borrow", async (c) => {
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
    logger.info(`Book borrowed: ${bookId} by user ${user_id}`);
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error(`Borrow failed for book ${bookId}: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/discover/return
discoverRoutes.post("/return", async (c) => {
  const { borrowBookId } = await c.req.json();
  const tokenFile = Bun.file(TOKEN_PATH);

  if (!(await tokenFile.exists())) {
    return c.json({ success: false, message: "Not authenticated" }, 401);
  }

  try {
    const {
      data: { access_token },
    } = await tokenFile.json();
    const result = await returnBook(access_token, borrowBookId);
    logger.info(`Book returned: ${borrowBookId}`);
    return c.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Return failed for ${borrowBookId}: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

module.exports = discoverRoutes;
