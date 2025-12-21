const fs = require("fs");
const path = require("path");
const { createRequest } = require("./api");
const { decryptKey, generatePasswordPDF, generatePasswordZip } = require("./crypto");
const { downloadBook, decryptPDF, extractZip, BOOKS_DIR, TEMP_DIR } = require("./downloader");

const API_BOOK_DETAIL = `https://api2-ipusnas.perpusnas.go.id/api/webhook/book-detail?book_id=`;
const API_CHECK_BORROW = `https://api2-ipusnas.perpusnas.go.id/api/webhook/check-borrow-status?book_id=`;

const getBookDetail = async (token, bookId) => {
  const client = createRequest({ headers: { Authorization: `Bearer ${token}` } });
  const { data } = await client.get(API_BOOK_DETAIL + bookId);
  return data;
};

const getBorrowInfo = async (token, bookId) => {
  const client = createRequest({ headers: { Authorization: `Bearer ${token}` } });
  const { data } = await client.get(API_CHECK_BORROW + bookId);
  return data;
};

const getSafeName = (title) => {
  return title
    .trim()
    .replace(/[^a-z0-9_\-\.]/gi, "_")
    .replace(/_+/g, "_");
};

const getLocalBooks = () => {
  if (!fs.existsSync(BOOKS_DIR)) return [];

  const books = [];
  const dirs = fs.readdirSync(BOOKS_DIR);

  for (const dir of dirs) {
    const dirPath = path.join(BOOKS_DIR, dir);
    if (fs.statSync(dirPath).isDirectory()) {
      const files = fs.readdirSync(dirPath);

      // Look for original decrypted files first
      let bookFile = files.find((f) => f.includes("_decrypted.pdf") || f.includes("_decrypted.epub"));

      // Fallback: search for any .pdf or .epub
      if (!bookFile) {
        bookFile = files.find((f) => f.toLowerCase().endsWith(".pdf") || f.toLowerCase().endsWith(".epub"));
      }

      if (bookFile) {
        const format = bookFile.toLowerCase().endsWith(".pdf") ? "PDF" : "EPUB";
        books.push({
          id: dir,
          title: dir.replace(/_/g, " "),
          filename: bookFile,
          path: path.join(dirPath, bookFile),
          format: format,
        });
      }
    }
  }
  return books;
};

const processBook = async (bookId, onProgress) => {
  const tokenPath = path.join(__dirname, "..", "..", "token.json");
  if (!fs.existsSync(tokenPath)) throw new Error("Token not found. Please login first.");

  const {
    data: { access_token, id: user_id },
  } = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));

  const {
    data: { id: b_id, book_title, using_drm, file_ext },
  } = await getBookDetail(access_token, bookId);
  const {
    data: {
      url_file,
      borrow_key,
      epustaka: { id: epustaka_id },
    },
  } = await getBorrowInfo(access_token, b_id);

  const safeName = getSafeName(book_title);
  const bookFolder = path.join(BOOKS_DIR, safeName);
  if (!fs.existsSync(bookFolder)) fs.mkdirSync(bookFolder, { recursive: true });

  const existingFiles = fs.readdirSync(bookFolder);
  const bestFile =
    existingFiles.find((f) => f.includes("_decrypted.pdf")) || existingFiles.find((f) => f.includes("_decrypted.epub"));

  if (bestFile) {
    onProgress?.({ percentage: 100, status: "Content already available.", filename: bestFile });
    return { path: path.join(bookFolder, bestFile), filename: bestFile };
  }

  const downloadedFile = await downloadBook(url_file, book_title, onProgress);
  const fileExt = path.extname(downloadedFile).toLowerCase();

  if (!using_drm) {
    const destPath = path.join(bookFolder, path.basename(downloadedFile));
    fs.renameSync(downloadedFile, destPath);
    return { path: destPath, filename: path.basename(downloadedFile) };
  } else {
    onProgress?.({ status: "Extracting DRM credentials..." });
    const dKey = decryptKey(user_id, b_id, epustaka_id, borrow_key);
    const passwordZip = generatePasswordZip(dKey, true);
    const pdfPassword = generatePasswordPDF(dKey);

    let targetFile = downloadedFile;
    if (fileExt === ".mdrm") {
      onProgress?.({ status: "Unlocking MDRM container..." });
      targetFile = extractZip(downloadedFile, passwordZip, b_id);
    }

    const targetExt = path.extname(targetFile).toLowerCase();
    const finalExt = targetExt.slice(1);
    const finalFilename = `${safeName}_decrypted.${finalExt}`;
    const finalPath = path.join(bookFolder, finalFilename);

    if (targetExt === ".pdf") {
      onProgress?.({ status: "Removing PDF protection..." });
      await decryptPDF(targetFile, pdfPassword, finalPath, onProgress);
    } else {
      fs.renameSync(targetFile, finalPath);
      onProgress?.({ status: "Extracted successfully." });
    }

    return { path: finalPath, filename: finalFilename };
  }
};

module.exports = {
  processBook,
  getLocalBooks,
};
