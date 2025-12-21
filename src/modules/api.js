const axios = require("axios");

const BASE_HEADERS = {
  Origin: "https://ipusnas2.perpusnas.go.id",
  Referer: "https://ipusnas2.perpusnas.go.id/",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "Content-Type": "application/vnd.api+json",
};

const createRequest = (config = {}) => {
  return axios.create({
    ...config,
    headers: {
      ...BASE_HEADERS,
      ...config.headers,
    },
  });
};

module.exports = {
  BASE_HEADERS,
  createRequest,
};
