import { ApplicationJob } from "./application-job.ts";

export class WelcomeEmailJob extends ApplicationJob {
  static performed: unknown[][] = [];

  perform(...args: unknown[]): void {
    WelcomeEmailJob.performed.push(args);
  }
}
