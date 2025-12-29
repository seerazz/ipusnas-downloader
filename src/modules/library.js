const fs = require("fs/promises");
const path = require("path");
const { BOOKS_DIR } = require("../config");

const getLocalBooks = async () => {
  try {
    await fs.access(BOOKS_DIR);
  } catch {
    return [];
  }

  try {
    const dirs = await fs.readdir(BOOKS_DIR);
    const books = (
      await Promise.all(
        dirs.map(async (dir) => {
          const dirPath = path.join(BOOKS_DIR, dir);
          try {
            const stats = await fs.stat(dirPath);
            if (stats.isDirectory()) {
              const files = await fs.readdir(dirPath);

              // Look for original decrypted files first
              let bookFile = files.find((f) => f.includes("_decrypted.pdf") || f.includes("_decrypted.epub"));

              // Fallback: search for any .pdf or .epub
              if (!bookFile) {
                bookFile = files.find((f) => f.toLowerCase().endsWith(".pdf") || f.toLowerCase().endsWith(".epub"));
              }

              if (bookFile) {
                const format = bookFile.toLowerCase().endsWith(".pdf") ? "PDF" : "EPUB";
                return {
                  id: dir,
                  title: dir.replace(/_/g, " "),
                  filename: bookFile,
                  path: path.join(dirPath, bookFile),
                  format: format,
                  addedAt: stats.birthtime,
                };
              }
            }
          } catch (e) {
            // Ignore individual folder errors
          }
          return null;
        })
      )
    ).filter(Boolean); // Filter out nulls
    return books;
  } catch (err) {
    console.error("Error reading library:", err);
    return [];
  }
};

const getLocalBook = async (safeName) => {
  const books = await getLocalBooks();
  return books.find((b) => b.id === safeName);
};

module.exports = {
  getLocalBooks,
  getLocalBook,
};
