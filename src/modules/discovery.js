const { createRequest } = require("./api");
const { API_URLS } = require("../config");

const searchBooks = async (token, query, offset = 0) => {
  const client = createRequest({
    headers: { Authorization: `Bearer ${token}` },
  });
  const url = `${API_URLS.SEARCH}?q=${encodeURIComponent(query)}&limit=25&offset=${offset}`;
  const { data } = await client.get(url);
  return data;
};

const getBookDetail = async (token, bookId) => {
  const client = createRequest({
    headers: { Authorization: `Bearer ${token}` },
  });
  const url = API_URLS.BOOK_DETAIL + bookId;
  const { data } = await client.get(url);
  return data.data || data;
};

const getEpustaka = async (token, bookId) => {
  const client = createRequest({
    headers: { Authorization: `Bearer ${token}` },
  });
  const url = `${API_URLS.EPUSTAKA}?book_id=${bookId}`;
  const { data } = await client.get(url);
  return data.data || data;
};

const borrowBook = async (token, payload) => {
  const client = createRequest({
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const url = API_URLS.BORROW;
  const { data } = await client.post(url, payload);
  return data;
};

const performBorrow = async (token, userId, bookId) => {
  // 1. Get detail to find organization_id
  const detail = await getBookDetail(token, bookId);

  // 2. Get available epustaka
  const epustakas = await getEpustaka(token, bookId);
  const target = Array.isArray(epustakas) ? epustakas[0] : epustakas;

  if (!target || !target.id) {
    throw new Error("No available library found for this book");
  }

  // 3. Borrow
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
  const client = createRequest({
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const url = API_URLS.RETURN;
  const { data } = await client.put(url, { borrow_book_id: borrowBookId });
  return data;
};

module.exports = {
  searchBooks,
  getBookDetail,
  getEpustaka,
  borrowBook,
  performBorrow,
  returnBook,
};
