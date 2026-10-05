import { FIXTURE_LOAD_PATH } from "../../../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { MimeType } from "../../../action-dispatch/http/mime-type.js";
import { Base } from "../../base.js";
import { TestCase } from "../../test-case.js";

class StarStarMimeController extends Base {
  async index(): Promise<void> {
    await this.render();
  }
}
StarStarMimeController.layout(null);

describe("StarStarMimeControllerTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new StarStarMimeController();
    await tc.beforeSetup();
  });

  it("javascript with format", async () => {
    tc.request.accept = "text/javascript";
    await tc.get("index", { format: "js" });
    expect(tc.response.body).toMatch("function addition(a,b){ return a+b; }");
  });

  it("javascript with no format", async () => {
    tc.request.accept = "text/javascript";
    await tc.get("index");
    expect(tc.response.body).toMatch("function addition(a,b){ return a+b; }");
  });

  it("javascript with no format only star star", async () => {
    tc.request.accept = "*/*";
    await tc.get("index");
    expect(tc.response.body).toMatch("function addition(a,b){ return a+b; }");
  });
});

class AbstractPostController extends Base {}
AbstractPostController.viewPaths(`${FIXTURE_LOAD_PATH}/post_test`);

class PostController extends AbstractPostController {
  async index(): Promise<void> {
    await this.respondTo("html", "iphone", "js");
  }

  private async withIphone(block: () => Promise<void>): Promise<void> {
    if (this.request.env["HTTP_ACCEPT"] === "text/iphone") this.request.setFormat("iphone");
    await block();
  }
}
PostController.aroundAction("withIphone");

class SuperPostController extends PostController {}

describe("MimeControllerLayoutsTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new PostController();
    await tc.beforeSetup();
    tc.request.host = "www.example.com";
    MimeType.registerAlias("text/html", ":iphone");
  });

  afterEach(() => {
    MimeType.unregister(":iphone");
  });

  it("missing layout renders properly", async () => {
    await tc.get("index");
    expect(tc.response.body).toBe('<html><div id="html">Hello Firefox</div></html>');

    tc.request.accept = "text/iphone";
    await tc.get("index");
    expect(tc.response.body).toBe("Hello iPhone");
  });

  it("format with inherited layouts", async () => {
    tc.controller = new SuperPostController();

    await tc.get("index");
    expect(tc.response.body).toBe('<html><div id="html">Super Firefox</div></html>');

    tc.request.accept = "text/iphone";
    await tc.get("index");
    expect(tc.response.body).toBe('<html><div id="super_iphone">Super iPhone</div></html>');
  });

  it("non navigational format with no template fallbacks to html template with no layout", async () => {
    await tc.get("index", { format: "js" });
    expect(tc.response.body).toBe("Hello Firefox");
  });
});
