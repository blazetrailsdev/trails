import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function version(): any {
  return ActiveJob.gemVersion();
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { version });
