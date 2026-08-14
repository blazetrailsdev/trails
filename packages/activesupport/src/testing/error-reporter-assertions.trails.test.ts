import { describe, expect, it } from "vitest";
import { ActiveSupport } from "../index.js";
import { assertErrorReported, assertNoErrorReported } from "./error-reporter-assertions.js";

class IOError extends Error {}

// `ErrorReporterAssertions` has no Rails test file of its own — Rails exercises
// it through the suites that use it (deprecation_test.rb, cache_store_behavior)
// — so its own coverage lives here.
describe("ActiveSupport::Testing::ErrorReporterAssertions", () => {
  it("returns the matching report", async () => {
    const report = await assertErrorReported(IOError, () => {
      ActiveSupport.errorReporter.report(new IOError("Oops"), { context: { section: "admin" } });
    });
    expect(report?.error.message).toBe("Oops");
    expect(report?.context.section).toBe("admin");
    expect(report?.isHandled()).toBe(true);
  });

  it("fails when no error is reported", async () => {
    await expect(assertErrorReported(IOError, () => {})).rejects.toThrow(
      "Expected a IOError to be reported, but there were no errors reported.",
    );
  });

  it("fails when no reported error matches", async () => {
    await expect(
      assertErrorReported(IOError, () => {
        ActiveSupport.errorReporter.report(new RangeError("nope"));
      }),
    ).rejects.toThrow(/none of the 1 reported errors matched/);
  });

  it("passes when nothing is reported", async () => {
    await expect(assertNoErrorReported(() => {})).resolves.toBeUndefined();
  });

  it("fails when something is reported", async () => {
    await expect(
      assertNoErrorReported(() => {
        ActiveSupport.errorReporter.report(new IOError("Oops"));
      }),
    ).rejects.toThrow(/to be empty\?/);
  });

  // Each `record` stacks its own recorder, so an inner assertion does not
  // swallow the reports an outer one is watching for.
  it("records nested blocks independently", async () => {
    const outer = await assertErrorReported(Error, async () => {
      await assertErrorReported(IOError, () => {
        ActiveSupport.errorReporter.report(new IOError("inner"));
      });
    });
    expect(outer?.error.message).toBe("inner");
  });
});
