import { Maintenance } from "./maintenance.js";

export class ConcurrencyMaintenance extends Maintenance {
  constructor(interval: number, batchSize: number) {
    super(interval, batchSize, { concurrency: true, batches: false });
  }
}
