const axios = require("axios");
const { refreshAccessToken, getTokenData, updateTokenFile, TokenExpiredError } = require("./token.service");
const logger = require("../utils/logger");

const BASE_HEADERS = {
  Origin: "https://ipusnas2.perpusnas.go.id",
  Referer: "https://ipusnas2.perpusnas.go.id/",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "Content-Type": "application/vnd.api+json",
};

/**
 * Create a basic axios request instance without auth retry logic.
 * Use this for non-authenticated requests or when you need manual control.
 */
const createRequest = (config = {}) => {
  return axios.create({
    ...config,
    headers: {
      ...BASE_HEADERS,
      ...config.headers,
    },
  });
};

/**
 * Create an authenticated axios instance with automatic 401 retry.
 * When a request fails with 401, it will:
 * 1. Attempt to refresh the token
 * 2. Retry the original request with the new token
 * 3. Throw TokenExpiredError if refresh fails
 * 
 * @param {string} accessToken - Current access token
 * @param {Object} config - Additional axios config
 * @returns {AxiosInstance} Configured axios instance
 */
const createAuthenticatedRequest = (accessToken, config = {}) => {
  const instance = axios.create({
    ...config,
    headers: {
      ...BASE_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      ...config.headers,
    },
  });

  // Add response interceptor for 401 handling
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Only retry once and only for 401 errors
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        logger.info("Received 401, attempting token refresh...");

        try {
          // Get current token data for refresh token
          const tokenData = await getTokenData();
          if (!tokenData?.data?.refresh_token) {
            throw new TokenExpiredError("No refresh token available");
          }

          // Refresh the token
          const newTokens = await refreshAccessToken(tokenData.data.refresh_token);

          // Update stored tokens
          await updateTokenFile(tokenData, newTokens);

          // Update the failed request with new token
          originalRequest.headers.Authorization = `Bearer ${newTokens.data.access_token}`;

          logger.info("Token refreshed, retrying original request...");

          // Retry with new token (use base axios to avoid interceptor loop)
          return axios(originalRequest);
        } catch (refreshError) {
          logger.error(`Token refresh failed during retry: ${refreshError.message}`);
          throw new TokenExpiredError("Session expired. Please login again.");
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

module.exports = {
  BASE_HEADERS,
  createRequest,
  createAuthenticatedRequest,
};
