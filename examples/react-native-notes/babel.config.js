module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "./babel/keep-uninitialized-fields",
      "./babel/static-block-this",
      "./babel/unshadow-globals",
      "./babel/per-file-import-meta-url",
      "./babel/computed-import-rejects",
    ],
  };
};
