import { beforeEach, describe, expect, it } from "vitest";
import "../../test-helpers/abstract-unit.js";
import { Logger } from "@blazetrails/activesupport";
import { ActionController } from "@blazetrails/actionpack";
import { FixtureResolver } from "../../testing/resolvers.js";

class CaptureController extends ActionController.Base {
  declare title: unknown;
  declare todo: unknown;

  static override controllerPath(): string {
    return "test";
  }

  async contentFor(): Promise<void> {
    this.title = null;
    await this.render({ layout: "talk_from_action" });
  }

  async contentForWithParameter(): Promise<void> {
    this.title = null;
    await this.render({ layout: "talk_from_action" });
  }

  async contentForConcatenated(): Promise<void> {
    this.title = null;
    await this.render({ layout: "talk_from_action" });
  }

  async nonErbBlockContentFor(): Promise<void> {
    this.title = null;
    await this.render({ layout: "talk_from_action" });
  }

  async properBlockDetection(): Promise<void> {
    this.todo = "some todo";
  }
}
CaptureController.viewPaths([
  new FixtureResolver({
    "test/capturing.tse":
      "<% const days = capture(() => { %>\n  Dreamy days\n<% }) %>\n<%= days %>",
    "test/content-for.tse":
      '<% contentFor("title", () => { -%>Putting stuff in the title!<% }) -%>Great stuff!',
    "test/content-for-with-parameter.tse":
      '<% contentFor("title", "Putting stuff in the title!") -%>\nGreat stuff!',
    "test/content-for-concatenated.tse":
      '<% contentFor("title", "Putting stuff ");\n   contentFor("title", "in the title!") -%>\nGreat stuff!',
    "test/proper-block-detection.tse": "<%= todo %>",
    "layouts/talk_from_action.tse": '<title><%= title ?? yield("title") %></title>\n<%= yield -%>',
  }),
]);

class CaptureTest extends ActionController.TestCase {
  static {
    this.tests(CaptureController);

    this.withRoutes(function () {
      this.get("contentFor", { to: "test#contentFor" });
      this.get("capturing", { to: "test#capturing" });
      this.get("properBlockDetection", { to: "test#properBlockDetection" });
      this.get("nonErbBlockContentFor", { to: "test#nonErbBlockContentFor" });
      this.get("contentForConcatenated", { to: "test#contentForConcatenated" });
      this.get("contentForWithParameter", { to: "test#contentForWithParameter" });
    });
  }

  override setup(): void {
    super.setup();
    (this.controller as unknown as { logger: Logger }).logger = new Logger(null);

    this.request.host = "www.nextangle.com";
  }

  expectedContentForOutput(): string {
    return "<title>Putting stuff in the title!</title>\nGreat stuff!";
  }
}

describe("CaptureTest", () => {
  let tc: CaptureTest;

  beforeEach(async ({ task }) => {
    tc = new CaptureTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("simple capture", async () => {
    await tc.get("capturing");
    expect(tc.response.body.trim()).toBe("Dreamy days");
  });

  it("content for", async () => {
    await tc.get("contentFor");
    expect(tc.response.body).toBe(tc.expectedContentForOutput());
  });

  it("should concatenate content for", async () => {
    await tc.get("contentForConcatenated");
    expect(tc.response.body).toBe(tc.expectedContentForOutput());
  });

  it("should set content for with parameter", async () => {
    await tc.get("contentForWithParameter");
    expect(tc.response.body).toBe(tc.expectedContentForOutput());
  });

  it.skip("non erb block content for", async () => {
    // BLOCKED: port-builder-template-handler
    await tc.get("nonErbBlockContentFor");
    expect(tc.response.body).toBe(tc.expectedContentForOutput());
  });

  it("proper block detection", async () => {
    await tc.get("properBlockDetection");
    expect(tc.response.body).toBe("some todo");
  });
});
