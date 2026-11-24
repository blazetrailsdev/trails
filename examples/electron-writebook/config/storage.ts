export default {
  test: {
    service: "Disk",
    root: "tmp/storage",
  },
  local: {
    service: "Disk",
    root: process.env.WRITEBOOK_STORAGE ?? "storage/files",
    public: true,
  },
};
