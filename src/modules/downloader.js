const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const AdmZip = require("adm-zip");
const { createRequest } = require("./api");
const { TEMP_DIR, BOOKS_DIR, QPDF_PATH } = require("../config");

// Ensure directories exist
(async () => {
  try {
    await fsPromises.mkdir(TEMP_DIR, { recursive: true });
    await fsPromises.mkdir(BOOKS_DIR, { recursive: true });
  } catch (e) {}
})();

const downloadBook = async (url, name, onProgress, signal) => {
  const safeName = name.trim().replace(/[^a-z0-9_\-\.]/gi, "_");
  const ext = path.extname(new URL(url).pathname) || ".pdf";
  const fileName = `${safeName}${ext}`;
  const inputPath = path.join(TEMP_DIR, fileName);

  try {
    await fsPromises.access(inputPath);
    onProgress?.({ percentage: 100, status: "File already in cache." });
    return inputPath;
  } catch {
    // File doesn't exist, proceed to download
  }

  const client = createRequest({ responseType: "stream" });

  try {
    const response = await client.get(url, { signal });
    const totalLength = parseInt(response.headers["content-length"] || "0", 10);
    let downloaded = 0;

    onProgress?.({ percentage: 0, total: totalLength, current: 0, status: "Starting download..." });

    const writer = fs.createWriteStream(inputPath);
    response.data.pipe(writer);

    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      if (totalLength) {
        const percentage = Math.round((downloaded / totalLength) * 100);
        onProgress?.({ percentage, total: totalLength, current: downloaded, status: "Downloading..." });
      }
    });

    // Add signal abort listener to destroy stream immediately
    if (signal) {
      signal.addEventListener("abort", () => {
        writer.destroy();
        response.data.destroy();
      });
    }

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        onProgress?.({ percentage: 100, status: "Download successful." });
        resolve(inputPath);
      });
      writer.on("error", (err) => {
        // cleanup on error
        fs.unlink(inputPath, () => {});
        reject(err);
      });
      if (signal) {
        signal.addEventListener("abort", () => {
          fs.unlink(inputPath, () => {});
          reject(new Error("Download cancelled"));
        });
      }
    });
  } catch (err) {
    if (path.existsSync(inputPath)) {
      fs.unlink(inputPath, () => {});
    }
    throw new Error(`Download failed: ${err.message}`);
  }
};

const decryptPDF = async (inputPath, password, outputPath, onProgress) => {
  try {
    onProgress?.({ percentage: 99, status: "Decrypting content..." });
    // Using Bun.spawn which is available in the Bun runtime environment
    const proc = Bun.spawn([QPDF_PATH, `--password=${password}`, "--decrypt", inputPath, outputPath]);
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`QPDF failed with code ${exitCode}: ${errorText}`);
    }

    onProgress?.({ percentage: 100, status: "Decryption complete." });
    try {
      await fsPromises.unlink(inputPath);
    } catch (e) {}
  } catch (err) {
    throw new Error(`QPDF decryption failed: ${err.message}`);
  }
};

const extractZip = async (inputPath, passwordZip, bookId) => {
  // AdmZip is synchronous, so we wrap it to ensure it doesn't break async contracts effectively
  // but it will still block the event loop for the duration of unzip.
  // In a perfect world, we'd use a stream-based unzipper or a worker.

  try {
    const zip = new AdmZip(inputPath);
    const entries = zip.getEntries();

    // Detect if this is a full EPUB structure (contains mimetype file)
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
      outZip.writeZip(outputFilePath); // This is also sync
      try {
        await fsPromises.unlink(inputPath);
      } catch (e) {}
      return outputFilePath;
    } else {
      // It's a single file (like a PDF) inside a zip
      const entry = entries.find((e) => e.entryName.includes(bookId) || entries.length === 1);
      if (!entry) throw new Error("Could not find book entry in archive.");

      const buffer = entry.getData(passwordZip);
      const ext = path.extname(entry.entryName) === ".moco" ? ".pdf" : path.extname(entry.entryName);
      const outputFilePath = path.join(TEMP_DIR, `${bookId}${ext}`);

      await fsPromises.writeFile(outputFilePath, buffer);

      try {
        await fsPromises.unlink(inputPath);
      } catch (e) {}
      return outputFilePath;
    }
  } catch (err) {
    throw new Error(`Extraction failed: ${err.message}`);
  }
};

module.exports = {
  downloadBook,
  decryptPDF,
  extractZip,
};
