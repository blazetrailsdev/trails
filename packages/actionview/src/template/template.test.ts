import { afterEach, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";

describe("TestTSETemplate", () => {
  afterEach(() => TemplateHandlers.clear());

  const newTemplate = (body: string): Template =>
    new Template({
      source: body,
      identifier: "hello template",
      handler: new Tse(),
      virtualPath: "hello",
      format: "html",
      locals: [],
    });

  const render = (template: Template): string =>
    template.render(new (Base.withEmptyTemplateCache())(null, {}, null), {});

  it("locals cannot be specified with positional arguments", () => {
    const template = newTemplate("<%# locals: (argument = 'content') -%>\n<%= argument %>");
    expect(() => render(template)).toThrow(
      "`argument` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("locals cannot be specified with block arguments", () => {
    const template = newTemplate("<%# locals: (&block) -%>\n<%= tag.div(block) %>");
    expect(() => render(template)).toThrow(
      "`block` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });
});
