const path = require("path");

const getDirStats = async (dirPath) => {
  try {
    // Bun.Glob is natively implemented and much faster than standard Node fs.readdir recursive for Bun runtime
    const glob = new Bun.Glob("**/*");
    let size = 0;
    let count = 0;

    for await (const file of glob.scan({ cwd: dirPath, onlyFiles: true })) {
      const fileRef = Bun.file(path.join(dirPath, file));
      size += fileRef.size;
      count++;
    }

    return { size, count };
  } catch (err) {
    return { size: 0, count: 0 };
  }
};

const normalizeName = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const getSafeName = (name) => {
  return name
    .trim()
    .replace(/[^a-z0-9_\-\.]/gi, "_")
    .replace(/_+/g, "_");
};

module.exports = {
  getDirStats,
  normalizeName,
  getSafeName,
};
