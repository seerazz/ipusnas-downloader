const fs = require("fs/promises");
const path = require("path");
const { createRequest } = require("./api");
const { decryptKey, generatePasswordPDF, generatePasswordZip } = require("./crypto");
const { downloadBook, decryptPDF, extractZip } = require("./downloader");
const { API_URLS, BOOKS_DIR, TOKEN_PATH } = require("../config");

// Concurrency Control
const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;
const downloadQueue = []; // Array of { bookId, task }

const processQueue = () => {
  if (activeDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const next = downloadQueue.shift();
    activeDownloads++;
    next.task();
  }
};

const getBookDetail = async (token, bookId) => {
  const client = createRequest({ headers: { Authorization: `Bearer ${token}` } });
  const { data } = await client.get(API_URLS.BOOK_DETAIL + bookId);
  return data;
};

const getBorrowInfo = async (token, bookId) => {
  const client = createRequest({ headers: { Authorization: `Bearer ${token}` } });
  const { data } = await client.get(API_URLS.CHECK_BORROW + bookId);
  return data;
};

const getSafeName = (title) => {
  return title
    .trim()
    .replace(/[^a-z0-9_\-\.]/gi, "_")
    .replace(/_+/g, "_");
};

// Track active book IDs and their progress
const activeJobs = new Map();

const getActiveJobs = () => {
  const jobs = {};
  for (const [id, info] of activeJobs.entries()) {
    jobs[id] = { percentage: info.percentage, status: info.status };
  }
  return jobs;
};

const cancelJob = (bookId) => {
  if (activeJobs.has(bookId)) {
    const job = activeJobs.get(bookId);
    job.controller.abort();
    activeJobs.delete(bookId);
    return true;
  }

  const qIdx = downloadQueue.findIndex((q) => q.bookId === bookId);
  if (qIdx !== -1) {
    const q = downloadQueue.splice(qIdx, 1)[0];
    q.reject(new Error("Download cancelled while in queue"));
    return true;
  }

  return false;
};

// Main processing function wrapped with queue logic
const processBook = async (bookId, onProgress) => {
  if (activeJobs.has(bookId) || downloadQueue.some((q) => q.bookId === bookId)) {
    throw new Error("Download already in progress or queued");
  }

  return new Promise((resolve, reject) => {
    const task = async () => {
      const controller = new AbortController();
      try {
        // Initialize job state
        activeJobs.set(bookId, {
          percentage: 0,
          status: "Starting...",
          controller,
        });

        // Wrap onProgress to update local state + call original callback
        const wrappedProgress = (data) => {
          const job = activeJobs.get(bookId);
          if (job) {
            activeJobs.set(bookId, { ...job, percentage: data.percentage, status: data.status });
          }
          onProgress?.(data);
        };

        const result = await executeProcessBook(bookId, wrappedProgress, controller.signal);
        resolve(result);
      } catch (err) {
        if (err.name === "AbortError" || err.code === "ERR_ABORTED") {
          // Cleanly handled cancellation
        } else {
          reject(err);
        }
      } finally {
        activeJobs.delete(bookId);
        activeDownloads--;
        processQueue();
      }
    };

    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      activeDownloads++;
      task();
    } else {
      onProgress?.({ percentage: 0, status: "Queued (Waiting for available slot...)" });
      downloadQueue.push({ bookId, task, resolve, reject });
    }
  });
};

const executeProcessBook = async (bookId, onProgress, signal) => {
  const tokenFile = Bun.file(TOKEN_PATH);

  if (!(await tokenFile.exists())) {
    throw new Error("Token not found. Please login first.");
  }

  const {
    data: { access_token, id: user_id },
  } = await tokenFile.json();

  const {
    data: { id: b_id, book_title, using_drm, file_ext },
  } = await getBookDetail(access_token, bookId);

  const {
    data: {
      url_file,
      borrow_key,
      cover_url,
      epustaka: { id: epustaka_id },
    },
  } = await getBorrowInfo(access_token, b_id);

  const safeName = getSafeName(book_title);
  const bookFolder = path.join(BOOKS_DIR, safeName);

  try {
    await fs.mkdir(bookFolder, { recursive: true });
    // Download cover if not exists
    const coverPath = path.join(bookFolder, "cover.jpg");
    try {
      await fs.access(coverPath);
    } catch (e) {
      if (cover_url) {
        onProgress?.({ percentage: 0, status: "Downloading cover..." });
        const coverClient = createRequest();
        const coverRes = await coverClient.get(cover_url, { responseType: "arraybuffer" });
        await fs.writeFile(coverPath, Buffer.from(coverRes.data));
      }
    }
  } catch (e) {}

  const existingFiles = await fs.readdir(bookFolder);
  const bestFile =
    existingFiles.find((f) => f.includes("_decrypted.pdf")) || existingFiles.find((f) => f.includes("_decrypted.epub"));

  if (bestFile) {
    onProgress?.({ percentage: 100, status: "Content already available.", filename: bestFile });
    return { path: path.join(bookFolder, bestFile), filename: bestFile };
  }

  const downloadedFile = await downloadBook(url_file, book_title, onProgress, signal);
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
      onProgress?.({ percentage: 99, status: "Unlocking MDRM container..." });
      targetFile = await extractZip(downloadedFile, passwordZip, b_id);
    }

    const targetExt = path.extname(targetFile).toLowerCase();
    const finalExt = targetExt.slice(1);
    const finalFilename = `${safeName}_decrypted.${finalExt}`;
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

module.exports = {
  processBook,
  getActiveJobs,
  cancelJob,
};
