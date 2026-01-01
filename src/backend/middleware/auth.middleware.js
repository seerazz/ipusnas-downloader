/**
 * Authentication middleware for protected routes.
 * Handles token validation and automatic refresh.
 */
const { getValidToken, TokenExpiredError } = require("../core/token.service");
const logger = require("../utils/logger");

/**
 * Middleware that validates and refreshes tokens as needed.
 * On success, sets accessToken and userId on context.
 * On failure, returns 401 with requiresLogin flag.
 */
const authMiddleware = async (c, next) => {
    try {
        const { accessToken, userId, tokenData } = await getValidToken();

        // Set token data on context for route handlers
        c.set("accessToken", accessToken);
        c.set("userId", userId);
        c.set("tokenData", tokenData);

        await next();
    } catch (err) {
        if (err instanceof TokenExpiredError) {
            logger.warn(`Auth middleware: ${err.message}`);
            return c.json(
                {
                    success: false,
                    message: err.message,
                    requiresLogin: true,
                },
                401
            );
        }

        // For other errors, log and return 500
        logger.error(`Auth middleware error: ${err.message}`);
        return c.json(
            {
                success: false,
                message: "Authentication error",
            },
            500
        );
    }
};

module.exports = { authMiddleware };
