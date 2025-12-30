const { CACHE_FILE } = require("../config");

const DEFAULT_TTL = 1000 * 60 * 60 * 24; // Default to 24 hours
let memoryCache = new Map();

// Helper to save cache to disk using Bun.write
const saveCache = async () => {
  try {
    const data = JSON.stringify(Array.from(memoryCache.entries()));
    await Bun.write(CACHE_FILE, data);
  } catch (e) {
    console.error("Failed to save cache:", e);
  }
};

// Helper to load cache from disk using Bun.file
const loadCache = async () => {
  try {
    const file = Bun.file(CACHE_FILE);
    if (await file.exists()) {
      const entries = await file.json();
      memoryCache = new Map(entries);

      // Clear expired items on load
      const now = Date.now();
      for (const [key, entry] of memoryCache.entries()) {
        if (now > entry.expires) {
          memoryCache.delete(key);
        }
      }
    }
  } catch (e) {
    // File might not exist yet
  }
};

// Initial load
loadCache();

const set = (key, data, ttlOverride) => {
  const expires = Date.now() + (ttlOverride || DEFAULT_TTL);
  memoryCache.set(key, { data, expires });
  saveCache();
};

const get = (key) => {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    memoryCache.delete(key);
    saveCache(); // Persist the deletion
    return null;
  }

  return entry.data;
};

const clear = () => {
  memoryCache.clear();
  saveCache();
};

/**
 * Helper to verify if a file exists and is not empty using Bun.file
 */
const verifyFile = async (filePath) => {
  try {
    const file = Bun.file(filePath);
    return (await file.exists()) && file.size > 0;
  } catch (e) {
    return false;
  }
};

module.exports = {
  set,
  get,
  clear,
  verifyFile,
};
