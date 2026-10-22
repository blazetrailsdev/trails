import { ApplicationJob } from "./application-job.js";

export class WelcomeEmailJob extends ApplicationJob {
  static performed: unknown[][] = [];

  perform(...args: unknown[]): void {
    WelcomeEmailJob.performed.push(args);
  }
}
