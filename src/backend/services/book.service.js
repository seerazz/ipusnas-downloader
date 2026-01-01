const { createAuthenticatedRequest } = require("../core/api");
const { API_URLS } = require("../config");
const cache = require("../core/cache");

const searchBooks = async (token, query, offset = 0) => {
  const cacheKey = `search:${query}:${offset}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const client = createAuthenticatedRequest(token);
  const url = `${API_URLS.SEARCH}?q=${encodeURIComponent(query)}&limit=25&offset=${offset}`;
  const { data } = await client.get(url);

  cache.set(cacheKey, data, 1000 * 60 * 5); // Cache search for 5 minutes
  return data;
};

const getBookDetail = async (token, bookId) => {
  const cacheKey = `detail:${bookId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const client = createAuthenticatedRequest(token);
  const url = API_URLS.BOOK_DETAIL + bookId;
  const { data } = await client.get(url);
  const result = data.data || data;

  cache.set(cacheKey, result);
  return result;
};

const getEpustaka = async (token, bookId) => {
  const client = createAuthenticatedRequest(token);
  const url = `${API_URLS.EPUSTAKA}?book_id=${bookId}`;
  const { data } = await client.get(url);
  return data.data || data;
};

const borrowBook = async (token, payload) => {
  const client = createAuthenticatedRequest(token, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const url = API_URLS.BORROW;
  const { data } = await client.post(url, payload);
  return data;
};

const performBorrow = async (token, userId, bookId) => {
  const detail = await getBookDetail(token, bookId);
  const epustakas = await getEpustaka(token, bookId);
  const target = Array.isArray(epustakas) ? epustakas[0] : epustakas;

  if (!target || !target.id) {
    throw new Error("No available library found for this book");
  }

  const payload = {
    epustaka_id: target.id,
    user_id: userId,
    book_id: bookId,
    organization_id:
      detail.catalog_info?.organization_id || target.organization_id || "1fe99d3c-b272-40cd-8d9c-a4871f4eaef2",
  };

  return await borrowBook(token, payload);
};

const returnBook = async (token, borrowBookId) => {
  const client = createAuthenticatedRequest(token, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const url = API_URLS.RETURN;
  const { data } = await client.put(url, { borrow_book_id: borrowBookId });
  return data;
};

const getBorrowInfo = async (token, bookId) => {
  const client = createAuthenticatedRequest(token);
  const { data } = await client.get(API_URLS.CHECK_BORROW + bookId);
  return data;
};

module.exports = {
  searchBooks,
  getBookDetail,
  getEpustaka,
  borrowBook,
  performBorrow,
  returnBook,
  getBorrowInfo,
};

