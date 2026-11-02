import { STDOUT, env } from "@blazetrails/ruby-compat";
import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";
import { TestUnitReporter, type Result } from "./reporter.js";

/** @noRailsEquivalent PERMANENT */
export class VitestResult implements Result {
  name: string;
  klass: string;
  time: number;
  failure: string | null;
  resultCode: string;
  sourceLocation: [string, number];

  constructor(testCase: TestCase) {
    const result = testCase.result();
    const error = result.errors?.[0];
    this.name = testCase.name;
    this.klass = testCase.parent.type === "suite" ? testCase.parent.fullName : "";
    this.time = (testCase.diagnostic()?.duration ?? 0) / 1000;
    this.sourceLocation = [testCase.module.moduleId, testCase.location?.line ?? 0];
    if (result.state === "skipped") {
      this.resultCode = "S";
      this.failure = result.note ?? "";
    } else if (error) {
      this.resultCode = error.name === "AssertionError" ? "F" : "E";
      this.failure = error.message;
    } else {
      this.resultCode = ".";
      this.failure = null;
    }
  }

  isSkipped(): boolean {
    return this.resultCode === "S";
  }

  isPassed(): boolean {
    return this.resultCode === ".";
  }

  toString(): string {
    const heading = this.klass === "" ? this.name : `${this.klass}#${this.name}`;
    const label = { F: "Failure", E: "Error", S: "Skipped" }[this.resultCode];
    return `${label}:\n${heading} [${this.sourceLocation.join(":")}]:\n${this.failure}\n`;
  }
}

/** @noRailsEquivalent PERMANENT */
export default class VitestReporter implements Reporter {
  reporter = new TestUnitReporter(STDOUT, {
    verbose: env.TRAILS_TEST_VERBOSE != null,
    outputInline: true,
    color: true,
  });

  results: VitestResult[] = [];

  onInit(vitest: Vitest): void {
    vitest.config.includeTaskLocation = true;
    TestUnitReporter.appRoot ??= vitest.config.root;
  }

  onTestCaseResult(testCase: TestCase): void {
    const result = new VitestResult(testCase);
    this.results.push(result);
    this.reporter.prerecord({ name: result.klass }, result.name);
    this.reporter.record(result);
  }

  onTestRunEnd(
    testModules: readonly TestModule[],
    unhandledErrors: readonly { message: string }[],
  ): void {
    this.reporter.report();
    const errors = [...testModules.flatMap((mod) => mod.errors()), ...unhandledErrors];
    const codes = this.results.map((result) => result.resultCode);
    const count = (code: string) => codes.filter((resultCode) => resultCode === code).length;
    STDOUT.puts();
    for (const error of errors) STDOUT.puts(error.message);
    STDOUT.puts(
      `${codes.length} runs, ${count("F")} failures, ${count("E") + errors.length} errors, ${count("S")} skips`,
    );
  }
}
