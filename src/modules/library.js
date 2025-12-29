const path = require("path");
const { BOOKS_DIR } = require("../config");

const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const getLocalBooks = async (remoteBooks = []) => {
  try {
    const glob = new Bun.Glob("*/*.{pdf,epub}");
    const books = [];

    for await (const file of glob.scan({ cwd: BOOKS_DIR, onlyFiles: true })) {
      if (file.includes("_decrypted")) {
        const dir = path.dirname(file);
        const filename = path.basename(file);
        const fullPath = path.join(BOOKS_DIR, file);
        const bookFolder = path.dirname(fullPath);

        const fileRef = Bun.file(fullPath);
        const addedAt = fileRef.lastModified;

        const coverPath = path.join(bookFolder, "cover.jpg");
        let localCover = null;
        try {
          const coverFile = Bun.file(coverPath);
          if (await coverFile.exists()) {
            localCover = `/books/${dir}/cover.jpg`;
          }
        } catch (e) {}

        // Find matching remote book for cover fallback
        const normalizedDir = normalize(dir);
        const remoteBook = remoteBooks.find((rb) => normalize(rb.book_title) === normalizedDir);

        books.push({
          id: dir,
          title: dir.replace(/_/g, " "),
          filename: filename,
          path: fullPath,
          cover_url: localCover || remoteBook?.cover_url,
          format: filename.toLowerCase().endsWith(".pdf") ? "PDF" : "EPUB",
          addedAt: new Date(addedAt),
        });
      }
    }

    const bookMap = new Map();
    for (const book of books) {
      if (!bookMap.has(book.id) || book.filename.includes("_decrypted")) {
        bookMap.set(book.id, book);
      }
    }

    return Array.from(bookMap.values()).sort((a, b) => b.addedAt - a.addedAt);
  } catch (err) {
    console.error("Error reading library:", err);
    return [];
  }
};

const getSyncedLibrary = async (remoteBooks) => {
  const localBooks = await getLocalBooks();

  return remoteBooks.map((rb) => {
    const rbSafe = normalize(rb.book_title);
    const localBook = localBooks.find((lb) => normalize(lb.id) === rbSafe);

    return {
      ...rb,
      isLocal: !!localBook,
      safeName: localBook
        ? localBook.id
        : rb.book_title
            .trim()
            .replace(/[^a-z0-9_\-\.]/gi, "_")
            .replace(/_+/g, "_"),
      localFilename: localBook ? localBook.filename : null,
      localFormat: localBook ? localBook.format : null,
      // Use local cover if available, otherwise fall back to remote cover
      localCoverUrl: localBook?.cover_url,
      cover_url: localBook?.cover_url || rb.cover_url,
    };
  });
};

module.exports = {
  getLocalBooks,
  getSyncedLibrary,
};
