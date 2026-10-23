export class Configuration {
  static readonly WORKER_DEFAULTS = {
    queues: "*",
    threads: 3,
    processes: 1,
    pollingInterval: 0.1,
  };

  static readonly DISPATCHER_DEFAULTS = {
    batchSize: 500,
    pollingInterval: 1,
    concurrencyMaintenance: true,
    concurrencyMaintenanceInterval: 600,
  };
}
