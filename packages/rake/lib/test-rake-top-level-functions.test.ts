import { beforeEach, describe, expect, it } from "vitest";
import { NameError, puts, rbModConstMissing, stdout as $stdout } from "@blazetrails/ruby-compat";
import type { Application } from "./application.js";
import { FileUtilsExt } from "./file-utils-ext.js";
import { Rake } from "./rake-module.js";
import { captureOutput, useApplicationTestCase } from "./test-helpers/application.js";
import { dsl } from "./test-helpers/file-creation.js";

describe("TestRakeTopLevelFunctions", () => {
  useApplicationTestCase();

  let app: { called: [unknown[], unknown][] };

  beforeEach(() => {
    const called: [unknown[], unknown][] = [];
    app = new Proxy(
      { called },
      {
        get: (target, name) =>
          name === "called"
            ? target.called
            : (...a: unknown[]) => {
                const b = typeof a.at(-1) === "function" ? a.pop() : null;
                called.push([[name, ...a], b]);
                return null;
              },
      },
    );
    Rake.application = app as unknown as Application;
  });

  it("namespace", () => {
    const block = () => {};

    dsl.namespace("xyz", block);

    const expected = [[["inNamespace", "xyz"], block]];

    expect(app.called).toEqual(expected);
  });

  it("import", () => {
    dsl.import("x", "y", "z");

    const expected = [
      [["addImport", "x"], null],
      [["addImport", "y"], null],
      [["addImport", "z"], null],
    ];

    expect(app.called).toEqual(expected);
  });

  it("when writing", async () => {
    const [out] = await captureOutput(() => {
      dsl.whenWriting("NOTWRITING", () => {
        puts.call($stdout, "WRITING");
      });
    });
    expect(out).toBe("WRITING\n");
  });

  it("when not writing", async () => {
    FileUtilsExt.nowriteFlag = true;
    try {
      const [, err] = await captureOutput(() => {
        dsl.whenWriting("NOTWRITING", () => {
          puts.call($stdout, "WRITING");
        });
      });
      expect(err).toBe("DRYRUN: NOTWRITING\n");
    } finally {
      FileUtilsExt.nowriteFlag = false;
    }
  });

  it("missing other constant", () => {
    expect(() => rbModConstMissing(Object as { name?: string }, "Xyz")).toThrow(NameError);
  });
});
