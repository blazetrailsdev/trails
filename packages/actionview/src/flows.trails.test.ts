import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fiber } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { StreamingBuffer } from "./buffers.js";
import { StreamingFlow } from "./flows.js";
import type { Template } from "./template.js";
import { LookupContext } from "./lookup-context.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";
import { FixtureResolver } from "./testing/resolvers.js";

describe("StreamingFlow", () => {
  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });
  afterEach(() => {
    TemplateHandlers.clear();
  });

  const setup = (layoutSource: string, templateSource: string) => {
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([
      new FixtureResolver({
        "layouts/streaming.html.tse": layoutSource,
        "test/streaming.html.tse": templateSource,
      }),
    ]);
    const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
    const chunks: string[] = [];
    const output = new StreamingBuffer((chunk) => chunks.push(chunk));
    const yielder = (...name: unknown[]) => view._layoutFor(...(name as [string?]));
    const layout = lookupContext.find("streaming", ["layouts"]) as Template;
    const template = lookupContext.find("streaming", ["test"]) as Template;
    const fiber = new Fiber(async () => {
      await layout.render(view, {}, output, {}, yielder);
    });
    view.viewFlow = new StreamingFlow(view, fiber);
    return { view, chunks, fiber, template, yielder };
  };

  it("suspends the layout at yield and resumes it when the template provides the key", async () => {
    const { view, chunks, fiber, template, yielder } = setup(
      '<title><%= _layoutFor("header") %></title>\n<%= yield %>\n<%= _layoutFor("footer") %>',
      '<% provide("header", "Yes, ") %>this works\n<% contentFor("footer", " like a charm") %>',
    );

    await fiber.resume();
    expect(fiber.isAlive()).toBe(true);
    expect(chunks.join("")).toBe("<title>");

    view.viewFlow.set("layout", template.render(view, {}, null, {}, yielder));
    while (fiber.isAlive()) await fiber.resume();

    expect(chunks.join("")).toBe("<title>Yes, </title>\nthis works\n\n like a charm");
  });

  it("suspends a content_for read until the template has rendered", async () => {
    const { view, chunks, fiber, template, yielder } = setup(
      '<%= contentFor("footer") %>|<%= isContentFor("missing") %>',
      '<% contentFor("footer", "foot") %>body',
    );

    await fiber.resume();
    expect(chunks).toEqual([]);

    view.viewFlow.set("layout", template.render(view, {}, null, {}, yielder));
    while (fiber.isAlive()) await fiber.resume();

    expect(chunks.join("")).toBe("foot|false");
  });
});
