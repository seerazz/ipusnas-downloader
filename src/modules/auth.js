const { createRequest } = require("./api");
const { API_URLS, TOKEN_PATH } = require("../config");

const login = async (email, password) => {
  try {
    const client = createRequest();
    const { data } = await client.post(API_URLS.LOGIN, { email, password });
    await Bun.write(TOKEN_PATH, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    throw new Error(`Login failed: ${err.message}`);
  }
};

const listBorrowedBooks = async (token) => {
  try {
    const client = createRequest({ headers: { Authorization: `Bearer ${token}` } });
    const { data } = await client.get(API_URLS.BORROW_SHELF);
    return data.data || [];
  } catch (err) {
    throw new Error(`Failed to fetch borrowed books: ${err.message}`);
  }
};

module.exports = {
  login,
  listBorrowedBooks,
};
