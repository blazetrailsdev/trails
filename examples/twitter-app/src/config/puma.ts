const port = parseInt(process.env.PORT || "3000", 10);
const environment = process.env.NODE_ENV || "development";

export default {
  port,
  environment,
  pidfile: "tmp/pids/server.pid",
  workers: parseInt(process.env.WEB_CONCURRENCY || "0", 10),
  maxThreads: parseInt(process.env.TRAILS_MAX_THREADS || "5", 10),
  minThreads: parseInt(process.env.TRAILS_MIN_THREADS || "5", 10),
};
