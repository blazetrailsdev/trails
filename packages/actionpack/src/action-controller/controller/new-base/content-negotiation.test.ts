import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { rbInspect, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("ContentNegotiation", { name: "ContentNegotiation" });

class BasicController extends Base {
  static {
    this.viewPaths([
      new FixtureResolver({
        "content-negotiation/basic/hello.html.tse":
          "Hello world <%= request.formats[0].toString() %>!",
      }),
    ]);
  }

  async all(): Promise<void> {
    await this.render({ plain: rbInspect(this.formats) });
  }
}

Object.defineProperty(BasicController, "name", { value: "ContentNegotiation::BasicController" });
controllerConstants.set("content_negotiation/basic", BasicController);

let t: InstanceType<typeof Rack.TestCase>;
const assertBody = (body: string): void => t.assertBody(body);

class TestContentNegotiation extends Rack.TestCase {}

describe("TestContentNegotiation", () => {
  beforeEach(({ task }) => {
    t = new TestContentNegotiation(task.name);
  });

  it("A */* Accept header will return HTML", async () => {
    await t.get("/content_negotiation/basic/hello", { headers: { HTTP_ACCEPT: "*/*" } });
    assertBody("Hello world */*!");
  });

  it("A js or */* Accept header will return HTML", async () => {
    await t.get("/content_negotiation/basic/hello", {
      headers: { HTTP_ACCEPT: "text/javascript, */*" },
    });
    assertBody("Hello world text/html!");
  });

  it("A js or */* Accept header on xhr will return JavaScript", async () => {
    await t.get("/content_negotiation/basic/hello", {
      headers: { HTTP_ACCEPT: "text/javascript, */*" },
      xhr: true,
    });
    assertBody("Hello world text/javascript!");
  });

  it("Unregistered mimes are ignored", async () => {
    await t.get("/content_negotiation/basic/all", {
      headers: { HTTP_ACCEPT: "text/plain, mime/another" },
    });
    assertBody("[:text]");
  });
});
