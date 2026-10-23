export class Configuration {
  static readonly WORKER_DEFAULTS = {
    queues: "*",
    threads: 3,
    processes: 1,
    pollingInterval: 0.1,
  };
}
