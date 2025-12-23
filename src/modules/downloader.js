const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const { createRequest } = require("./api");

const TEMP_DIR = path.join(__dirname, "..", "..", "temp");
const BOOKS_DIR = path.join(__dirname, "..", "..", "books");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });
const qpdfPath = path.join(__dirname, "..", "..", "bin", "qpdf.exe");

const downloadBook = async (url, name, onProgress) => {
  const safeName = name.trim().replace(/[^a-z0-9_\-\.]/gi, "_");
  const ext = path.extname(new URL(url).pathname) || ".pdf";
  const fileName = `${safeName}${ext}`;
  const inputPath = path.join(TEMP_DIR, fileName);

  if (fs.existsSync(inputPath)) {
    onProgress?.({ percentage: 100, status: "File already in cache." });
    return inputPath;
  }

  const client = createRequest({ responseType: "stream" });
  const response = await client.get(url);
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

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      onProgress?.({ percentage: 100, status: "Download successful." });
      resolve(inputPath);
    });
    writer.on("error", reject);
  });
};

const decryptPDF = async (inputPath, password, outputPath, onProgress) => {
  try {
    onProgress?.({ status: "Decrypting content..." });
    const proc = Bun.spawn([qpdfPath, `--password=${password}`, "--decrypt", inputPath, outputPath]);
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`QPDF failed with code ${exitCode}: ${errorText}`);
    }

    onProgress?.({ status: "Decryption complete." });
    try {
      fs.unlinkSync(inputPath);
    } catch (e) {}
  } catch (err) {
    throw new Error(`QPDF decryption failed: ${err.message}`);
  }
};

const extractZip = (inputPath, passwordZip, bookId) => {
  const zip = new AdmZip(inputPath);
  const entries = zip.getEntries();

  // Detect if this is a full EPUB structure (contains mimetype file)
  const isEpubStructure = entries.some((e) => e.entryName === "mimetype");

  if (isEpubStructure) {
    // It's a directory-style EPUB, we need to extract everything and repackage as a clean .epub zip
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
      fs.unlinkSync(inputPath);
    } catch (e) {}
    return outputFilePath;
  } else {
    // It's a single file (like a PDF) inside a zip
    const entry = entries.find((e) => e.entryName.includes(bookId) || entries.length === 1);
    if (!entry) throw new Error("Could not find book entry in archive.");

    const buffer = entry.getData(passwordZip);
    const ext = path.extname(entry.entryName) === ".moco" ? ".pdf" : path.extname(entry.entryName);
    const outputFilePath = path.join(TEMP_DIR, `${bookId}${ext}`);
    fs.writeFileSync(outputFilePath, buffer);

    try {
      fs.unlinkSync(inputPath);
    } catch (e) {}
    return outputFilePath;
  }
};

module.exports = {
  downloadBook,
  decryptPDF,
  extractZip,
  TEMP_DIR,
  BOOKS_DIR,
};
