import {
  assert,
  assertEmpty,
  assertEqual,
  assertKindOf,
  assertNil,
  assertPredicate,
} from "@blazetrails/activesupport";
import { MockRequest, Response as RackResponseObject } from "@blazetrails/rack";
import type { RackResponse as RackTriplet } from "@blazetrails/rack";
import { include, registerConstant, type Included } from "@blazetrails/ruby-compat";
import { beforeEach, describe, it } from "vitest";
import { Metal } from "../../metal.js";
import { Head } from "../../metal/head.js";
import { TestCase } from "../../test-case.js";
import { Request } from "../../../action-dispatch/request.js";
import type { Response } from "../../../action-dispatch/response.js";
import "../../../test-helpers/abstract-unit.js";

class BareController extends Metal {
  index(): void {
    this.responseBody = "Hello world";
  }

  assignResponseArray(): void {
    this.response = [200, { "content-type": "text/html" }, ["Hello world"]] as unknown as Response;
  }

  assignResponseObject(): void {
    this.response = new RackResponseObject("Hello world", 200, {
      "content-type": "text/html",
    }) as unknown as Response;
  }

  assignResponseBodyProc(): void {
    this.responseBody = ((stream: { close(): void }) => {
      stream.close();
    }) as unknown as string;
  }
}
Object.defineProperty(BareController, "name", { value: "BareMetalTest::BareController" });
registerConstant("BareMetalTest::BareController", BareController);

describe("BareTest", () => {
  it("response body is a Rack-compatible response", async () => {
    const [status, headers, body] = await BareController.action("index")(MockRequest.envFor("/"));
    assertEqual(200, status);
    let string = "";

    for await (const part of body as AsyncIterable<unknown>) {
      assert(typeof part === "string", "Each part of the body must be a String");
      string += part;
    }

    assertKindOf(Object, headers, "Headers must be a Hash");
    assert(headers["content-type"], "Content-Type must exist");

    assertEqual("Hello world", string);
  });

  // BLOCKED: metal-response-body-setter-flattens-instead-of-wrapping
  it.skip("response_body value is wrapped in an array when the value is a String", () => {
    const controller = new BareController();
    controller.setRequestBang(Request.empty());
    controller.setResponseBang(BareController.makeResponseBang(controller.request));
    controller.index();

    assertPredicate(controller, (c) => c.performed);
    assertEqual(["Hello world"], controller.responseBody);
  });

  // BLOCKED: metal-response-setter-stores-true-in-response-body
  it.skip("can assign response array as part of the controller execution", () => {
    const controller = new BareController();
    controller.setRequestBang(Request.empty());
    controller.assignResponseArray();

    assertPredicate(controller, (c) => c.performed);
    assertEqual(true, controller.responseBody);
    assertEqual(200, (controller.response as unknown as RackTriplet)[0]);
    assertEqual("text/html", (controller.response as unknown as RackTriplet)[1]["content-type"]);
  });

  // BLOCKED: metal-response-setter-stores-true-in-response-body
  it.skip("can assign response object as part of the controller execution", () => {
    const controller = new BareController();
    controller.setRequestBang(Request.empty());
    controller.assignResponseObject();

    assertPredicate(controller, (c) => c.performed);
    assertEqual(true, controller.responseBody);
    assertEqual(200, controller.response.status);
    assertEqual(
      "text/html",
      (controller.response as unknown as RackResponseObject).headers["content-type"],
    );
  });

  // BLOCKED: metal-response-body-setter-flattens-instead-of-wrapping
  it.skip("can assign response body streamable object as part of the controller execution", () => {
    const controller = new BareController();
    controller.setRequestBang(Request.empty());
    controller.setResponseBang(BareController.makeResponseBang(controller.request));
    controller.assignResponseBodyProc();

    assertPredicate(controller, (c) => c.performed);
    assert(typeof controller.responseBody === "function");
    assertEqual(200, controller.response.status);
    assertPredicate(controller.response.headers, (h) => h.empty);
  });

  it("connect a request to controller instance without dispatch", () => {
    const env = {};
    const controller = new BareController();
    controller.setRequestBang(new Request(env));
    assert(controller.request);
  });
});

class BareEmptyController extends Metal {
  index(): void {
    this.responseBody = null;
  }
}

describe("BareEmptyTest", () => {
  it("response body is nil", () => {
    const controller = new BareEmptyController();
    controller.setRequestBang(Request.empty());
    controller.setResponseBang(BareController.makeResponseBang(controller.request));
    controller.index();
    assertNil(controller.responseBody);
  });
});

class HeadController extends Metal {
  declare head: Included<typeof Head>["head"];

  index(): void {
    this.head("not_found");
  }

  continue(): void {
    this.contentType = "text/html";
    this.head(100);
  }

  switchingProtocols(): void {
    this.contentType = "text/html";
    this.head(101);
  }

  processing(): void {
    this.contentType = "text/html";
    this.head(102);
  }

  earlyHints(): void {
    this.contentType = "text/html";
    this.head(103);
  }

  noContent(): void {
    this.contentType = "text/html";
    this.head(204);
  }

  resetContent(): void {
    this.contentType = "text/html";
    this.head(205);
  }

  notModified(): void {
    this.contentType = "text/html";
    this.head(304);
  }
}
include(HeadController, Head);

async function body(rackResponse: RackTriplet): Promise<string> {
  const buf: unknown[] = [];
  for await (const x of rackResponse[2] as AsyncIterable<unknown>) buf.push(x);
  return buf.join("");
}

describe("HeadTest", () => {
  it("head works on its own", async () => {
    const status = (await HeadController.action("index")(MockRequest.envFor("/")))[0];
    assertEqual(404, status);
  });

  it("head :continue (100) does not return a content-type header", async () => {
    const headers = (await HeadController.action("continue")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :switching_protocols (101) does not return a content-type header", async () => {
    const headers = (await HeadController.action("switchingProtocols")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :processing (102) does not return a content-type header", async () => {
    const headers = (await HeadController.action("processing")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :early_hints (103) does not return a content-type header", async () => {
    const headers = (await HeadController.action("earlyHints")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :no_content (204) does not return a content-type header", async () => {
    const headers = (await HeadController.action("noContent")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :reset_content (205) does not return a content-type header", async () => {
    const headers = (await HeadController.action("resetContent")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :not_modified (304) does not return a content-type header", async () => {
    const headers = (await HeadController.action("notModified")(MockRequest.envFor("/")))[1];
    assertNil(headers["content-type"]);
    assertNil(headers["content-length"]);
  });

  it("head :no_content (204) does not return any content", async () => {
    const content = await body(await HeadController.action("noContent")(MockRequest.envFor("/")));
    assertEmpty(content);
  });

  it("head :reset_content (205) does not return any content", async () => {
    const content = await body(
      await HeadController.action("resetContent")(MockRequest.envFor("/")),
    );
    assertEmpty(content);
  });

  it("head :not_modified (304) does not return any content", async () => {
    const content = await body(await HeadController.action("notModified")(MockRequest.envFor("/")));
    assertEmpty(content);
  });

  it("head :continue (100) does not return any content", async () => {
    const content = await body(await HeadController.action("continue")(MockRequest.envFor("/")));
    assertEmpty(content);
  });

  it("head :switching_protocols (101) does not return any content", async () => {
    const content = await body(
      await HeadController.action("switchingProtocols")(MockRequest.envFor("/")),
    );
    assertEmpty(content);
  });

  it("head :processing (102) does not return any content", async () => {
    const content = await body(await HeadController.action("processing")(MockRequest.envFor("/")));
    assertEmpty(content);
  });
});

class BareControllerTest extends TestCase {}
Object.defineProperty(BareControllerTest, "name", { value: "BareMetalTest::BareControllerTest" });

describe("BareControllerTest", () => {
  let tc: BareControllerTest;

  beforeEach(async ({ task }) => {
    tc = new BareControllerTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("GET index", async () => {
    await tc.get("index");
    assertEqual("Hello world", tc.response.body);
  });
});
