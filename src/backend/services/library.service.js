const path = require("path");
const fs = require("fs/promises");
const { BOOKS_DIR } = require("../config");
const { normalizeName, getSafeName } = require("../utils/file.utils");

/**
 * Scans the local books directory for decrypted book files and matches them with metadata.
 * @returns {Promise<Array>} List of local books with metadata enrichment.
 */
const getLocalBooks = async () => {
  try {
    const glob = new Bun.Glob("*/*.{pdf,epub}");
    const books = [];

    // First scan to find all potential book files
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

        // Use folder name as ID for local books if meta missing
        books.push({
          id: dir,
          folderName: dir, // Preserve folder name explicitly
          title: dir.replace(/_/g, " "),
          filename: filename,
          path: fullPath,
          cover_url: localCover,
          format: filename.toLowerCase().endsWith(".pdf") ? "PDF" : "EPUB",
          addedAt: new Date(addedAt),
          book_author: "Unknown Author",
          publisher_name: null,
        });
      }
    }

    // Deduplicate: If multiple decrypted files exist for same book, verify/merge
    const bookMap = new Map();
    for (const book of books) {
      if (!bookMap.has(book.id)) {
        bookMap.set(book.id, book);
      }
    }

    // Enrich with metadata if available
    const finalBooks = await Promise.all(
      Array.from(bookMap.values()).map(async (book) => {
        try {
          const metaPath = path.join(path.dirname(book.path), "meta.json");
          const metaFile = Bun.file(metaPath);
          if (await metaFile.exists()) {
            const meta = await metaFile.json();
            return {
              ...book,
              ...meta,
              id: String(meta.id || book.id),
              folderName: book.folderName, // Ensure folderName persists
              cover_url: book.cover_url || meta.cover_url,
            };
          }
        } catch (e) {}
        return book;
      })
    );

    return finalBooks.sort((a, b) => b.addedAt - a.addedAt);
  } catch (err) {
    console.error("Error reading library:", err);
    return [];
  }
};

/**
 * Synchronizes the remote borrowed books list with local downloads.
 * @param {Array} remoteBooks - List of books from the API.
 * @returns {Promise<Array>} Synced book list with 'isLocal' status and local path info.
 */
const getSyncedLibrary = async (remoteBooks) => {
  const localBooks = await getLocalBooks();
  // Create a Set of normalized local IDs or titles for fast lookup
  const localSet = new Set(localBooks.map((b) => normalizeName(String(b.id))));
  const localTitleSet = new Set(localBooks.map((b) => normalizeName(b.title)));

  return remoteBooks.map((rb) => {
    const rbSafe = normalizeName(rb.book_title);
    // basic check
    const isDownloaded = localSet.has(normalizeName(String(rb.id))) || localTitleSet.has(rbSafe);

    // Find the actual local match to get details
    const localMatch = localBooks.find(
      (lb) => normalizeName(String(lb.id)) === normalizeName(String(rb.id)) || normalizeName(lb.title) === rbSafe
    );

    return {
      ...rb,
      // Enrich with local metadata if available
      ...(localMatch
        ? {
            catalog_info: localMatch.catalog_info,
            publisher_name: localMatch.publisher_name,
            publication_year: localMatch.publication_year,
            publish_date: localMatch.publish_date,
            category_name: localMatch.category_name,
            isbn: localMatch.isbn,
          }
        : {}),
      id: rb.id,
      // Metadata enrichment
      safeName: localMatch ? localMatch.folderName || localMatch.id : getSafeName(rb.book_title),
      localFilename: localMatch ? localMatch.filename : null,
      localFormat: localMatch ? localMatch.format : null,
      localCoverUrl: localMatch?.cover_url,
      cover_url: localMatch?.cover_url || rb.cover_url,
      isLocal: !!localMatch,
    };
  });
};

module.exports = {
  getLocalBooks,
  getSyncedLibrary,
};
