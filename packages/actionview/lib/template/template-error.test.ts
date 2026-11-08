import { describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { excSetBacktrace, rbInspect } from "@blazetrails/ruby-compat";
import { Template } from "../template.js";
import type { TemplateError } from "./error.js";

describe("TemplateErrorTest", () => {
  it("provides original message", () => {
    let error!: TemplateError;
    try {
      throw new Error("original");
    } catch (errinfo) {
      error = new Template.Error("test", errinfo as Error);
    }

    assertEqual("original", error.message);
  });

  it("provides original backtrace", () => {
    let error!: TemplateError;
    try {
      const originalException = new Error();
      excSetBacktrace(originalException, ["foo", "bar", "baz"]);
      throw originalException;
    } catch (errinfo) {
      error = new Template.Error("test", errinfo as Error);
    }

    assertEqual(["foo", "bar", "baz"], error.backtrace());
  });

  it("provides useful inspect", () => {
    let error!: TemplateError;
    try {
      throw new Error("original");
    } catch (errinfo) {
      error = new Template.Error("test", errinfo as Error);
    }

    assertEqual("#<ActionView::Template::Error: original>", rbInspect(error));
  });

  it("annotated source code returns empty array if source cant be found", () => {
    const template = new (class {
      get identifier() {
        return "something";
      }
    })() as unknown as Template;

    let error!: TemplateError;
    try {
      throw new Error();
    } catch (errinfo) {
      error = new Template.Error(template, errinfo as Error);
    }

    assertEqual([], error.annotatedSourceCode());
  });
});
