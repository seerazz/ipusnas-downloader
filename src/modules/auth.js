const fs = require("fs");
const path = require("path");
const { createRequest } = require("./api");

const API_LOGIN = `https://api2-ipusnas.perpusnas.go.id/api/auth/login`;
const API_LIST_BORROW = `https://api2-ipusnas.perpusnas.go.id/api/webhook/book-borrow-shelf`;

const login = async (email, password) => {
  try {
    const client = createRequest();
    const { data } = await client.post(API_LOGIN, { email, password });
    const tokenPath = path.join(__dirname, "..", "..", "token.json");
    fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    throw new Error(`Login failed: ${err.message}`);
  }
};

const listBorrowedBooks = async (token) => {
  try {
    const client = createRequest({ headers: { Authorization: `Bearer ${token}` } });
    const { data } = await client.get(API_LIST_BORROW);
    return data.data || [];
  } catch (err) {
    throw new Error(`Failed to fetch borrowed books: ${err.message}`);
  }
};

module.exports = {
  login,
  listBorrowedBooks,
};
