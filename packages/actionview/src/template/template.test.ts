import { afterEach, describe, expect, it } from "vitest";
import { assertNothingRaised } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";

describe("TestTSETemplate", () => {
  afterEach(() => TemplateHandlers.clear());

  const newTemplate = (body: string): Template =>
    new Template(body, "hello template", new Tse(), {
      virtualPath: "hello",
      format: "html",
      locals: [],
    });

  const render = async (
    template: Template,
    locals: Record<string, unknown> = {},
    implicitLocals: readonly string[] = [],
  ): Promise<string> =>
    String(
      await template.render(new (Base.withEmptyTemplateCache())(null, {}, null), locals, null, {
        implicitLocals,
      }),
    );

  it("locals cannot be specified with positional arguments", async () => {
    const template = newTemplate("<%# locals: (argument = 'content') -%>\n<%= argument %>");
    await expect(render(template)).rejects.toThrow(
      "`argument` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("locals cannot be specified with block arguments", async () => {
    const template = newTemplate("<%# locals: (&block) -%>\n<%= tag.div(block) %>");
    await expect(render(template)).rejects.toThrow(
      "`block` set as non-keyword argument for hello template. Locals can only be set as keyword arguments.",
    );
  });

  it("rails injected locals does not raise error if not passed", async () => {
    const template = newTemplate("<%# locals: (message:) -%>");
    await assertNothingRaised(() =>
      render(template, { message: "Hi", message_counter: 1, message_iteration: 1 }, [
        "message_counter",
        "message_iteration",
      ]),
    );
  });

  it("rails injected locals can be specified", async () => {
    const template = newTemplate("<%# locals: (message: 'Hello') -%>\n<%= message %>");
    expect(await render(template, { message: "Hello" }, ["message"])).toBe("Hello");
  });

  it("rails injected locals can be specified as kwargs", async () => {
    const template = newTemplate(
      "<%# locals: (message: 'Hello', **kwargs) -%>\n<%= kwargs.message_counter %>-<%= kwargs.message_iteration %>",
    );
    expect(
      await render(template, { message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("1-2");
  });

  it("rails injected locals can be specified as required argument", async () => {
    const template = newTemplate(
      "<%# locals: (message: 'Hello', message_iteration:) -%>\n<%= message %>-<%= message_iteration %>",
    );
    expect(
      await render(template, { message: "Hello", message_counter: 1, message_iteration: 2 }, [
        "message_counter",
        "message_iteration",
      ]),
    ).toBe("Hello-2");
  });
  it("rails local assigns and strict locals", async () => {
    const template = newTemplate('<%# locals: (class: ) -%>\n<%= localAssigns["class"] %>');
    expect(await render(template, { class: "some-class" }, ["message"])).toBe("some-class");
  });
});
