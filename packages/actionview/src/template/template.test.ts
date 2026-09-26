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

  const render = (
    template: Template,
    locals: Record<string, unknown> = {},
    implicitLocals: readonly string[] = [],
  ): string =>
    template.render(new (Base.withEmptyTemplateCache())(null, {}, null), locals, null, {
      implicitLocals,
    });

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

  it("rails injected locals does not raise error if not passed", () => {
    const template = newTemplate("<%# locals: (message:) -%>");
    expect(() =>
      render(template, { message: "Hi", message_counter: 1, message_iteration: 1 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).not.toThrow();
  });

  it("rails injected locals can be specified", () => {
    const template = newTemplate("<%# locals: (message: 'Hello') -%>\n<%= message %>");
    expect(render(template, { message: "Hello" }, ["message"])).toBe("Hello");
  });

  it("rails injected locals can be specified as kwargs", () => {
    const template = newTemplate(
      "<%# locals: (message: 'Hello', **kwargs) -%>\n<%= kwargs.message_counter %>-<%= kwargs.message_iteration %>",
    );
    expect(
      render(template, { message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("1-2");
  });

  it("rails injected locals can be specified as required argument", () => {
    const template = newTemplate(
      "<%# locals: (message: 'Hello', message_iteration:) -%>\n<%= message %>-<%= message_iteration %>",
    );
    expect(
      render(template, { message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("Hello-2");
  });
  it("rails local assigns and strict locals", () => {
    const template = newTemplate('<%# locals: (class: ) -%>\n<%= localAssigns["class"] %>');
    expect(render(template, { class: "some-class" }, ["message"])).toBe("some-class");
  });
});
