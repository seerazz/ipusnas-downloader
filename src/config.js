const path = require("path");

// Directory Paths
const ROOT_DIR = path.resolve(__dirname, "..");
const BOOKS_DIR = path.join(ROOT_DIR, "books");
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const BIN_DIR = path.join(ROOT_DIR, "bin");

// File Paths
const TOKEN_PATH = path.join(ROOT_DIR, "token.json");
const QPDF_PATH = path.join(BIN_DIR, "qpdf.exe");

// API Endpoints
const API_BASE_URL = "https://api2-ipusnas.perpusnas.go.id/api";
const AGENT_BASE_URL = "https://api2-ipusnas.perpusnas.go.id/agent";

const API_URLS = {
  LOGIN: `${API_BASE_URL}/auth/login`,
  BOOK_DETAIL: `${API_BASE_URL}/webhook/book-detail?book_id=`,
  CHECK_BORROW: `${API_BASE_URL}/webhook/check-borrow-status?book_id=`,
  BORROW_SHELF: `${API_BASE_URL}/webhook/book-borrow-shelf`,
  SEARCH: `${API_BASE_URL}/webhook/search-book`,
  EPUSTAKA: `${API_BASE_URL}/webhook/epustaka-borrow`,
  BORROW: `${AGENT_BASE_URL}/webhook/borrow`,
  RETURN: `${API_BASE_URL}/webhook/book-return`,
};

module.exports = {
  ROOT_DIR,
  BOOKS_DIR,
  TEMP_DIR,
  BIN_DIR,
  TOKEN_PATH,
  QPDF_PATH,
  API_URLS,
};
