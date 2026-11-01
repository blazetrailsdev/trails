import { Interrupt, StringIO } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { TestUnitReporter } from "./reporter.js";

const FILE = "test/test_unit/reporter_test.rb";

class FakeResult {
  name = "woot";
  klass = "TestUnitReporterTest::ExampleTest";
  time = 0;
  sourceLocation: [string, number] = [FILE, 9];
  constructor(
    readonly resultCode: string,
    readonly failure: string | null,
  ) {}
  isSkipped() {
    return this.resultCode === "S";
  }
  isPassed() {
    return this.resultCode === ".";
  }
  toString() {
    return this.failure!;
  }
}

const location = `${FILE}:9`;
const heading = "TestUnitReporterTest::ExampleTest#woot";
const snippet = `bin/rails test ${location}\n\n`;
const failedTest = () => new FakeResult("F", `Failure:\n${heading} [${location}]:\nboo\n`);
const erroredTest = () =>
  new FakeResult("E", `Error:\n${heading}:\nArgumentError: wups\n    some_test.rb:4\n`);
const passingTest = () => new FakeResult(".", null);
const skippedTest = () => {
  const st = new FakeResult(
    "S",
    `Skipped:\n${heading} [${location}]:\nskipchurches, misstemples\n`,
  );
  st.time = 10;
  return st;
};

describe("TestUnitReporterTest", () => {
  let output: StringIO & { isTty?: () => boolean };
  let reporter: TestUnitReporter;
  const record = (result: FakeResult) => {
    reporter.prerecord({ name: result.klass }, result.name);
    reporter.record(result);
  };
  const run = (result: FakeResult) => {
    record(result);
    reporter.report();
  };
  const rerunSnippetCount = () =>
    output.string().match(/^(bin\/rails test|bin\/test) /gm)?.length ?? 0;

  beforeEach(() => {
    output = new StringIO();
    reporter = new TestUnitReporter(output, { outputInline: true });
  });

  it("prints rerun snippet to run a single failed test", () => {
    run(failedTest());
    expect(output.string()).toMatch(/^bin\/rails test .*test\/test_unit\/reporter_test\.rb:\d+$/m);
    expect(rerunSnippetCount()).toBe(1);
  });

  it("prints rerun snippet for every failed test", () => {
    record(failedTest());
    record(failedTest());
    run(failedTest());
    expect(rerunSnippetCount()).toBe(3);
  });

  it("does not print snippet for successful and skipped tests", () => {
    record(passingTest());
    run(skippedTest());
    expect(output.string()).not.toContain("Failed tests:");
    expect(rerunSnippetCount()).toBe(0);
  });

  it("prints rerun snippet for skipped tests if run in verbose mode", () => {
    reporter = new TestUnitReporter(output, { verbose: true });
    run(skippedTest());
    expect(rerunSnippetCount()).toBe(1);
  });

  it("allows to customize the executable in the rerun snippet", () => {
    const originalExecutable = TestUnitReporter.executable;
    try {
      TestUnitReporter.executable = "bin/test";
      run(failedTest());
      expect(output.string()).toMatch(/^bin\/test .*test\/test_unit\/reporter_test\.rb:\d+$/m);
    } finally {
      TestUnitReporter.executable = originalExecutable;
    }
  });

  it("outputs failures inline", () => {
    run(failedTest());
    expect(output.string()).toBe(`F\n\nFailure:\n${heading} [${location}]:\nboo\n\n${snippet}`);
  });

  it("outputs errors inline", () => {
    run(erroredTest());
    expect(output.string()).toBe(
      `E\n\nError:\n${heading}:\nArgumentError: wups\n    some_test.rb:4\n\n${snippet}`,
    );
  });

  it("outputs skipped tests inline if verbose", () => {
    reporter = new TestUnitReporter(output, { verbose: true, outputInline: true });
    run(skippedTest());
    expect(output.string()).toBe(
      `${heading} = 10.00 s = S\n\n\nSkipped:\n${heading} [${location}]:\nskipchurches, misstemples\n\n${snippet}`,
    );
  });

  it("does not output rerun snippets after run", () => {
    run(failedTest());
    expect(output.string()).not.toContain("Failed tests:");
  });

  it("fail fast interrupts run on failure", () => {
    reporter = new TestUnitReporter(output, { failFast: true });
    expect(() => record(failedTest())).toThrow(Interrupt);
  });

  it("fail fast interrupts run on error", () => {
    reporter = new TestUnitReporter(output, { failFast: true });
    expect(() => record(erroredTest())).toThrow(Interrupt);
  });

  it("fail fast does not interrupt run skips", () => {
    reporter = new TestUnitReporter(output, { failFast: true });
    record(skippedTest());
    expect(output.string()).not.toContain("Failed tests:");
  });

  describe("with a tty", () => {
    beforeEach(() => {
      output.isTty = () => true;
      reporter = new TestUnitReporter(output, { color: true, outputInline: true });
    });
    it("outputs colored passing results", () => {
      record(passingTest());
      expect(output.string()).toContain("\x1b[32m.\x1b[0m");
    });
    it("outputs colored skipped results", () => {
      record(skippedTest());
      expect(output.string()).toContain("\x1b[33mS\x1b[0m");
    });
    it("outputs colored failed results", () => {
      record(failedTest());
      expect(output.string()).toContain(
        `\x1b[31mF\x1b[0m\n\n\x1b[31mFailure:\n${heading} [${location}]:\nboo\n\x1b[0m\n\n${snippet}`,
      );
    });
    it("outputs colored error results", () => {
      record(erroredTest());
      expect(output.string()).toContain(
        `\x1b[31mE\x1b[0m\n\n\x1b[31mError:\n${heading}:\nArgumentError: wups\n    some_test.rb:4\n\x1b[0m`,
      );
    });
  });
});
