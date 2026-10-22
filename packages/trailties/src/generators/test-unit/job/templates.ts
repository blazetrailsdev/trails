import type { JobGenerator } from "./job-generator.js";

type Template = (this: JobGenerator) => string;

/** @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms */
const unitTest: Template = function () {
  const root = "../".repeat(this.classPathParts.length + 1);
  return `import "${root}test-helper.js";
import { ActiveJob } from "@blazetrails/activejob";

export class ${this.className().split("::").join("")}JobTest extends ActiveJob.TestCase {
  // test("the truth", () => {
  //   assert(true);
  // });
}
`;
};

export const TEMPLATES: Record<"unit_test", Template> = {
  unit_test: unitTest,
};
