import { classify } from "@blazetrails/activesupport";
import { dasherize } from "../../base.js";
import type { JobGenerator } from "./job-generator.js";

type Template = (this: JobGenerator) => string;

/** @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms */
const job: Template = function () {
  const parentClassName = this.parentClassName();
  const root = "../".repeat(this.classPathParts.length);
  return `import { ${classify(parentClassName)} } from "${root || "./"}${dasherize(parentClassName)}.js";

export class ${this.className().split("::").pop()}Job extends ${classify(parentClassName)} {
  static {
    this.queueAs("${this.options.queue}");
  }

  perform(...args: unknown[]): void {
    // Do something later
  }
}
`;
};

/** @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms */
const applicationJob = function (): string {
  return `import { ActiveJob } from "@blazetrails/activejob";

export class ApplicationJob extends ActiveJob.Base {
  // Automatically retry jobs that encountered a deadlock
  // static { this.retryOn(ActiveRecord.Deadlocked); }

  // Most jobs are safe to ignore if the underlying records are no longer available
  // static { this.discardOn(ActiveJob.DeserializationError); }
}
`;
};

export const TEMPLATES = {
  job,
  application_job: applicationJob,
};
