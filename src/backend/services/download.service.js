const fs = require("fs/promises");
const AdmZip = require("adm-zip");
const path = require("path");
const { createRequest } = require("../core/api");
const { TEMP_DIR, BOOKS_DIR, QPDF_PATH } = require("../config");
const { getSafeName } = require("../utils/file.utils");
const { getBookDetail, getBorrowInfo } = require("./book.service");
const { decryptKey, generatePasswordPDF, generatePasswordZip } = require("../core/crypto");
const { getValidToken } = require("../core/token.service");

// --- DOWNLOADER SERVICE ---

const downloadFile = async (url, name, onProgress, signal) => {
  const safeName = getSafeName(name);
  const ext = path.extname(new URL(url).pathname) || ".pdf";
  const fileName = `${safeName}${ext}`;
  const inputPath = path.join(TEMP_DIR, fileName);

  if (await Bun.file(inputPath).exists()) {
    onProgress?.({ percentage: 100, status: "Using existing download cache." });
    return inputPath;
  }

  const client = createRequest({ responseType: "stream" });

  try {
    const response = await client.get(url, { signal });
    const totalLength = parseInt(response.headers["content-length"] || "0", 10);
    let downloaded = 0;
    let startTime = Date.now();
    let lastUpdate = Date.now();

    onProgress?.({ percentage: 0, total: totalLength, current: 0, status: "Starting download..." });

    const writer = Bun.file(inputPath).writer();

    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      writer.write(chunk);

      const now = Date.now();
      if (now - lastUpdate > 500 && totalLength) {
        const elapsed = (now - startTime) / 1000;
        const speed = downloaded / elapsed;
        const speedKB = (speed / 1024).toFixed(1);

        const percentage = Math.round((downloaded / totalLength) * 100);
        onProgress?.({
          percentage,
          total: totalLength,
          current: downloaded,
          status: `Downloading... (${speedKB} KB/s)`,
        });
        lastUpdate = now;
      }
    });

    return new Promise((resolve, reject) => {
      const abortHandler = async () => {
        response.data.destroy();
        await writer.end();
        try {
          await Bun.file(inputPath).delete();
        } catch (e) { }
        reject(new Error("AbortError"));
      };

      if (signal) {
        if (signal.aborted) {
          return abortHandler();
        }
        signal.addEventListener("abort", abortHandler);
      }

      response.data.on("end", async () => {
        if (signal) signal.removeEventListener("abort", abortHandler);
        await writer.end();
        if (signal?.aborted) return; // double check
        onProgress?.({ percentage: 100, status: "Download successful." });
        resolve(inputPath);
      });

      response.data.on("error", async (err) => {
        if (signal) signal.removeEventListener("abort", abortHandler);
        await writer.end();
        try {
          await Bun.file(inputPath).delete();
        } catch (e) { }
        reject(err);
      });
    });
  } catch (err) {
    if (err.message === "AbortError") throw err;
    try {
      const file = Bun.file(inputPath);
      if (await file.exists()) {
        await file.delete();
      }
    } catch (e) { }
    throw new Error(`Download failed: ${err.message}`);
  }
};

const decryptPDF = async (inputPath, password, outputPath, onProgress) => {
  try {
    onProgress?.({ percentage: 99, status: "Decrypting content..." });
    const proc = Bun.spawn([QPDF_PATH, `--password=${password}`, "--decrypt", inputPath, outputPath]);
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`QPDF failed with code ${exitCode}: ${errorText}`);
    }

    onProgress?.({ percentage: 100, status: "Decryption complete." });
    try {
      const file = Bun.file(inputPath);
      if (await file.exists()) {
        await file.delete();
      }
    } catch (e) { }
  } catch (err) {
    throw new Error(`QPDF decryption failed: ${err.message}`);
  }
};

const extractZip = async (inputPath, passwordZip, bookId) => {
  try {
    const zip = new AdmZip(inputPath);
    const entries = zip.getEntries();
    const isEpubStructure = entries.some((e) => e.entryName === "mimetype");

    if (isEpubStructure) {
      const outZip = new AdmZip();
      for (const entry of entries) {
        try {
          const data = entry.getData(passwordZip);
          outZip.addFile(entry.entryName, data);
        } catch (e) {
          console.error(`Failed to decrypt entry ${entry.entryName}:`, e.message);
        }
      }
      const outputFilePath = path.join(TEMP_DIR, `${bookId}.epub`);
      outZip.writeZip(outputFilePath);
      try {
        await Bun.file(inputPath).delete();
      } catch (e) { }
      return outputFilePath;
    } else {
      const entry = entries.find((e) => e.entryName.includes(bookId) || entries.length === 1);
      if (!entry) throw new Error("Could not find book entry in archive.");

      const buffer = entry.getData(passwordZip);
      const ext = path.extname(entry.entryName) === ".moco" ? ".pdf" : path.extname(entry.entryName);
      const outputFilePath = path.join(TEMP_DIR, `${bookId}${ext}`);

      await Bun.write(outputFilePath, buffer);
      try {
        await Bun.file(inputPath).delete();
      } catch (e) { }
      return outputFilePath;
    }
  } catch (err) {
    throw new Error(`Extraction failed: ${err.message}`);
  }
};

// --- QUEUE MANAGEMENT ---

const MAX_CONCURRENT_DOWNLOADS = 2;
const downloadQueue = new Map(); // bookId -> { controller, status, percentage, isRunning: boolean }
const pendingList = []; // Array of { bookId, startFn, reject }

const getQueueStatus = () => {
  const jobs = Array.from(downloadQueue.entries()).map(([bookId, job]) => ({
    bookId,
    status: job.status,
    percentage: job.percentage,
  }));
  return { active: jobs.length, jobs };
};

const processNext = () => {
  const runningCount = Array.from(downloadQueue.values()).filter((j) => j.isRunning).length;
  if (runningCount >= MAX_CONCURRENT_DOWNLOADS) return;

  const nextItem = pendingList.shift();
  if (!nextItem) return;

  // Check if still valid (not cancelled)
  if (!downloadQueue.has(nextItem.bookId)) {
    processNext(); // skip and try next
    return;
  }

  nextItem.startFn();
  processNext(); // Try to start more if slots available
};

const cancelJob = (bookId) => {
  const job = downloadQueue.get(bookId);
  if (job) {
    job.controller.abort();
    downloadQueue.delete(bookId);

    // If it was in pending list, remove it and reject promise
    const idx = pendingList.findIndex((x) => x.bookId === bookId);
    if (idx !== -1) {
      const [item] = pendingList.splice(idx, 1);
      item.reject(new Error("Cancelled"));
    }

    // If it was validly cancelled, we return true
    return true;
  }
  return false;
};

const executeProcessBook = async (bookId, onProgress, signal) => {
  // Use token service for automatic refresh
  const { accessToken: access_token, userId: user_id } = await getValidToken();

  const detail = await getBookDetail(access_token, bookId);
  if (signal?.aborted) throw new Error("AbortError");

  const borrowInfo = await getBorrowInfo(access_token, bookId);
  if (signal?.aborted) throw new Error("AbortError");

  const { id: b_id, book_title, using_drm } = detail;
  const {
    url_file,
    borrow_key,
    cover_url,
    epustaka: { id: epustaka_id },
  } = borrowInfo.data;

  const safeName = getSafeName(book_title);
  const bookFolder = path.join(BOOKS_DIR, safeName);

  try {
    await fs.mkdir(bookFolder, { recursive: true });

    // Save metadata
    try {
      const metaPath = path.join(bookFolder, "meta.json");
      await Bun.write(metaPath, JSON.stringify(detail, null, 2));
    } catch (e) {
      console.error("Failed to save metadata:", e);
    }

    const coverPath = path.join(bookFolder, "cover.jpg");
    if (!(await Bun.file(coverPath).exists()) && cover_url) {
      if (signal?.aborted) throw new Error("AbortError");
      onProgress?.({ percentage: 0, status: "Downloading cover..." });
      const coverRes = await createRequest().get(cover_url, { responseType: "arraybuffer" });
      await Bun.write(coverPath, coverRes.data);
    }
  } catch (e) { }

  if (signal?.aborted) throw new Error("AbortError");

  const downloadedFile = await downloadFile(url_file, book_title, onProgress, signal);
  if (signal?.aborted) throw new Error("AbortError");

  const fileExt = path.extname(downloadedFile).toLowerCase();

  if (!using_drm) {
    const finalFilename = `${safeName}_decrypted${fileExt}`;
    const destPath = path.join(bookFolder, finalFilename);
    await fs.rename(downloadedFile, destPath);
    return { path: destPath, filename: finalFilename };
  } else {
    onProgress?.({ percentage: 99, status: "Extracting DRM credentials..." });
    const dKey = decryptKey(user_id, b_id, epustaka_id, borrow_key);
    const passwordZip = generatePasswordZip(dKey, true);
    const pdfPassword = generatePasswordPDF(dKey);

    let targetFile = downloadedFile;
    if (fileExt === ".mdrm") {
      if (signal?.aborted) throw new Error("AbortError");
      onProgress?.({ percentage: 99, status: "Unlocking MDRM container..." });
      targetFile = await extractZip(downloadedFile, passwordZip, b_id);
    }

    if (signal?.aborted) throw new Error("AbortError");

    const targetExt = path.extname(targetFile).toLowerCase();
    const finalFilename = `${safeName}_decrypted.${targetExt.slice(1)}`;
    const finalPath = path.join(bookFolder, finalFilename);

    if (targetExt === ".pdf") {
      onProgress?.({ percentage: 99, status: "Removing PDF protection..." });
      await decryptPDF(targetFile, pdfPassword, finalPath, onProgress);
    } else {
      await fs.rename(targetFile, finalPath);
      onProgress?.({ percentage: 100, status: "Extracted successfully." });
    }

    return { path: finalPath, filename: finalFilename };
  }
};

const queueDownload = async (bookId, onProgress) => {
  if (downloadQueue.has(bookId)) {
    throw new Error("Download already in progress");
  }

  const controller = new AbortController();

  // Initialize job status
  downloadQueue.set(bookId, {
    controller,
    status: "Queued",
    percentage: 0,
    isRunning: false,
  });

  // Initial feedback
  onProgress({ status: "Queued", percentage: 0 });

  return new Promise((resolve, reject) => {
    const startFn = async () => {
      const job = downloadQueue.get(bookId);
      if (!job) return; // Cancelled

      job.isRunning = true;
      job.status = "Starting...";

      try {
        const result = await executeProcessBook(
          bookId,
          (progress) => {
            // Update local status for polling
            const j = downloadQueue.get(bookId);
            if (j) {
              Object.assign(j, progress);
              onProgress(progress);
            }
          },
          controller.signal
        );
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        downloadQueue.delete(bookId);
        processNext();
      }
    };

    pendingList.push({ bookId, startFn, reject });
    processNext();
  });
};

module.exports = {
  queueDownload,
  cancelJob,
  getQueueStatus,
};
