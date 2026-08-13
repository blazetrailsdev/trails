export default {
  development: {
    adapter: "async",
  },
  test: {
    adapter: "test",
  },
  production: {
    adapter: "redis",
    url: process.env.REDIS_URL || "redis://localhost:6379/1",
  },
};
