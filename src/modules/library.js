const path = require("path");
const { BOOKS_DIR } = require("../config");

const getLocalBooks = async () => {
  try {
    const glob = new Bun.Glob("*/*.{pdf,epub}");
    const books = [];

    // Scan for PDF/EPUBs one level deep
    // Pattern matches: [DIR]/[FILE].pdf or [DIR]/[FILE].epub
    for await (const file of glob.scan({ cwd: BOOKS_DIR, onlyFiles: true })) {
      if (file.includes("_decrypted")) {
        const dir = path.dirname(file);
        const filename = path.basename(file);
        const fullPath = path.join(BOOKS_DIR, file);

        // Get stats for birthtime
        const fileRef = Bun.file(fullPath);
        const addedAt = await fileRef.lastModified; // Bun file prop

        books.push({
          id: dir,
          title: dir.replace(/_/g, " "),
          filename: filename,
          path: fullPath,
          format: filename.toLowerCase().endsWith(".pdf") ? "PDF" : "EPUB",
          addedAt: new Date(addedAt),
        });
      }
    }

    // Note: The previous logic had a fallback for non-decrypted files.
    // The Glob pattern "*/*.{pdf,epub}" combined with the if check simplifies this.
    // If you want strictly the "best" file per folder, we might need to group by folder.

    // Group by folder to emulate "best file" logic
    const bookMap = new Map();
    for (const book of books) {
      if (!bookMap.has(book.id) || book.filename.includes("_decrypted")) {
        bookMap.set(book.id, book);
      }
    }

    return Array.from(bookMap.values());
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
