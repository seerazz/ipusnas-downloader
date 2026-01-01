/**
 * Modular authentication routes for the iPusnas Downloader.
 * Handles login, logout, and initial library synchronization.
 */
const { Hono } = require("hono");
const { login, listBorrowedBooks } = require("../core/auth");
const { TOKEN_PATH } = require("../config");
const { getSyncedLibrary } = require("../services/library.service");
const logger = require("../utils/logger");

const authRoutes = new Hono();

// POST /api/login
authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  try {
    const data = await login(email, password);
    logger.info(`User logged in: ${data.data.name} (${email})`);
    return c.json({ success: true, user: data.data });
  } catch (err) {
    logger.error(`Login failed for ${email}: ${err.message}`);
    return c.json({ success: false, message: err.message }, 401);
  }
});

// POST /api/logout
authRoutes.post("/logout", async (c) => {
  try {
    const tokenFile = Bun.file(TOKEN_PATH);
    if (await tokenFile.exists()) {
      await tokenFile.delete();
      logger.info("User logged out, token deleted.");
    }
  } catch (e) {
    logger.error("Error during logout", e);
  }
  return c.json({ success: true });
});

// GET /api/books (Legacy path name for synced library)
authRoutes.get("/books", async (c) => {
  const tokenFile = Bun.file(TOKEN_PATH);
  if (!(await tokenFile.exists())) {
    return c.json({ success: false, message: "Not authenticated" }, 401);
  }

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
    logger.error(`Failed to sync library: ${err.message}`);
    return c.json({ success: false, message: err.message }, 500);
  }
});

module.exports = authRoutes;
