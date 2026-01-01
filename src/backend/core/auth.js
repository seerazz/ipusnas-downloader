const { createRequest } = require("./api");
const { API_URLS, TOKEN_PATH } = require("../config");

/**
 * Authenticates the user with iPusnas API.
 * @param {string} email - User email.
 * @param {string} password - User password.
 * @returns {Promise<Object>} The authentication response data.
 * @throws {Error} If authentication fails.
 */
const login = async (email, password) => {
  try {
    const client = createRequest();
    const { data } = await client.post(
      API_URLS.LOGIN,
      { email, password },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    await Bun.write(TOKEN_PATH, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    const data = err.response?.data;
    let msg = data?.message || data?.error || err.message;

    // Handle case where message is an object containing the actual message
    if (typeof msg === "object" && msg !== null && msg.message) {
      msg = msg.message;
    }

    if (typeof msg === "object") {
      msg = JSON.stringify(msg);
    }

    throw new Error(msg);
  }
};

/**
 * Fetches the list of borrowed books for the authenticated user.
 * @param {string} token - The access token.
 * @returns {Promise<Array>} List of borrowed books.
 * @throws {Error} If the request fails.
 */
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
