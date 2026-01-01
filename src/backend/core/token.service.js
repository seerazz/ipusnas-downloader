/**
 * Centralized token management service.
 * Handles token reading, refresh, and persistence.
 * 
 * NOTE: This file uses axios directly instead of createRequest from api.js
 * to avoid circular dependency issues (api.js imports from this file).
 */
const axios = require("axios");
const { TOKEN_PATH, API_URLS } = require("../config");
const logger = require("../utils/logger");

// Base headers needed for iPusnas API
const BASE_HEADERS = {
  Origin: "https://ipusnas2.perpusnas.go.id",
  Referer: "https://ipusnas2.perpusnas.go.id/",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
};

/**
 * Custom error for when token refresh fails and user must re-login.
 */
class TokenExpiredError extends Error {
  constructor(message = "Session expired. Please login again.") {
    super(message);
    this.name = "TokenExpiredError";
    this.requiresLogin = true;
  }
}

/**
 * Read the full token data from token.json.
 * @returns {Promise<Object|null>} Token data or null if not exists.
 */
const getTokenData = async () => {
  const tokenFile = Bun.file(TOKEN_PATH);
  if (!(await tokenFile.exists())) {
    return null;
  }
  return await tokenFile.json();
};

/**
 * Check if the access token is expired based on expired_at field.
 * Adds a 60-second buffer to refresh slightly before actual expiry.
 * @param {Object} tokenData - The token data object.
 * @returns {boolean} True if token is expired or will expire soon.
 */
const isTokenExpired = (tokenData) => {
  if (!tokenData?.data?.expired_at) {
    return true; // If no expiry info, consider it expired
  }

  const expiryTime = new Date(tokenData.data.expired_at).getTime();
  const now = Date.now();
  const bufferMs = 60 * 1000; // 60 seconds buffer

  return now >= expiryTime - bufferMs;
};

/**
 * Refresh the access token using the refresh token.
 * Uses axios directly to avoid circular dependency with api.js.
 * @param {string} refreshToken - The refresh token.
 * @returns {Promise<Object>} New token data from the API.
 * @throws {TokenExpiredError} If refresh fails.
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    logger.info("Attempting to refresh access token...");

    const { data } = await axios.post(
      API_URLS.REFRESH,
      { refresh_token: refreshToken },
      {
        headers: {
          ...BASE_HEADERS,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info("Access token refreshed successfully.");
    return data;
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    logger.error(`Token refresh failed: ${errorMsg}`);
    throw new TokenExpiredError();
  }
};

/**
 * Update the token.json file with new token data.
 * Preserves user info (id, name, etc.) while updating tokens.
 * @param {Object} existingData - Current token data.
 * @param {Object} newTokens - New tokens from refresh response.
 * @returns {Promise<Object>} Updated token data.
 */
const updateTokenFile = async (existingData, newTokens) => {
  const updatedData = {
    ...existingData,
    data: {
      ...existingData.data,
      access_token: newTokens.data.access_token,
      refresh_token: newTokens.data.refresh_token,
      expired_at: newTokens.data.expired_at,
    },
  };

  await Bun.write(TOKEN_PATH, JSON.stringify(updatedData, null, 2));
  logger.debug("Token file updated with new tokens.");

  return updatedData;
};

/**
 * Get a valid access token, refreshing if necessary.
 * This is the main function to use for getting tokens.
 * @returns {Promise<Object>} Object with { accessToken, userId, tokenData }.
 * @throws {TokenExpiredError} If token doesn't exist or refresh fails.
 */
const getValidToken = async () => {
  let tokenData = await getTokenData();

  if (!tokenData) {
    throw new TokenExpiredError("Not authenticated. Please login.");
  }

  // Check if token is expired and needs refresh
  if (isTokenExpired(tokenData)) {
    const refreshToken = tokenData.data?.refresh_token;

    if (!refreshToken) {
      throw new TokenExpiredError("No refresh token available. Please login again.");
    }

    // Attempt refresh
    const newTokens = await refreshAccessToken(refreshToken);

    // Update token file and get updated data
    tokenData = await updateTokenFile(tokenData, newTokens);
  }

  return {
    accessToken: tokenData.data.access_token,
    userId: tokenData.data.id,
    tokenData: tokenData,
  };
};

module.exports = {
  TokenExpiredError,
  getTokenData,
  isTokenExpired,
  refreshAccessToken,
  updateTokenFile,
  getValidToken,
};
