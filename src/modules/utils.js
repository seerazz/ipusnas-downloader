const path = require("path");

const getDirSize = async (dir) => {
  let totalSize = 0;
  try {
    const glob = new Bun.Glob("**/*");
    for await (const file of glob.scan({ cwd: dir })) {
      const filePath = path.join(dir, file);
      totalSize += await Bun.file(filePath).size;
    }
  } catch (e) {
    // Directory might not exist or be empty
    return 0;
  }
  return totalSize;
};

module.exports = {
  getDirSize,
};
