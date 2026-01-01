/**
 * Modular download routes for the iPusnas Downloader.
 * Manages Server-Sent Events (SSE) for download progress and job control.
 */
const { Hono } = require("hono");
const { streamSSE } = require("hono/streaming");
const { queueDownload, cancelJob, getQueueStatus } = require("../services/download.service");
const logger = require("../utils/logger");

const downloadRoutes = new Hono();

// POST /api/download/:bookId
downloadRoutes.post("/download/:bookId", async (c) => {
  const bookId = c.req.param("bookId");
  logger.info(`Download requested for book: ${bookId}`);

  return streamSSE(c, async (stream) => {
    try {
      const result = await queueDownload(bookId, async (data) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "progress", ...data }) });
      });
      logger.info(`Download complete for book: ${bookId}`);
      await stream.writeSSE({ data: JSON.stringify({ type: "complete", ...result }) });
    } catch (err) {
      if (err.message === "Cancelled" || err.message === "AbortError") {
        logger.info(`Download cancelled for book: ${bookId}`);
      } else {
        logger.error(`Download failed for book ${bookId}: ${err.message}`);
      }
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message: err.message }) });
    }
  });
});

// GET /api/downloads/active
downloadRoutes.get("/downloads/active", (c) => {
  return c.json({ success: true, ...getQueueStatus() });
});

// POST /api/downloads/cancel/:bookId
downloadRoutes.post("/downloads/cancel/:bookId", (c) => {
  const bookId = c.req.param("bookId");
  if (cancelJob(bookId)) {
    logger.info(`Cancelled download job: ${bookId}`);
    return c.json({ success: true, message: "Download cancelled" });
  }
  return c.json({ success: false, message: "Job not found" }, 404);
});

module.exports = downloadRoutes;
