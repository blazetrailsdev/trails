import { describe, it, expect } from "vitest";
import { BigDecimal, include, isModuleIncluded, TopLevel } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { b, StringIO } from "@blazetrails/ruby-compat";
import { UploadedFile } from "@blazetrails/rack-test";
import {
  Behavior,
  LiveTestResponse,
  TestCase,
  TestRequest,
  TestSession,
  newControllerThread,
  originalCleanUpThreadLocals,
  originalNewControllerThread,
} from "./test-case.js";
import {
  Buffer as LiveBuffer,
  Live,
  cleanUpThreadLocals as liveCleanUpThreadLocals,
  newControllerThread as liveNewControllerThread,
} from "./metal/live.js";
import { Base } from "./base.js";
import type { UploadedFile as HttpUploadedFile } from "../action-dispatch/http/upload.js";
import "../test-helpers/abstract-unit.js";

describe("TestRequest#assignParameters Content-Type case", () => {
  it("raises on a Content-Type no Mime::Type is registered for", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "Application/Vnd.Custom+Json; charset=utf-8");
    expect(() => req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"])).toThrow(
      "Unknown Content-Type: Application/Vnd.Custom+Json; charset=utf-8",
    );
  });

  it("encodes an :xml body with to_xml", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/xml");
    req.assignParameters(null, "api", "create", { x: "1" }, "/api", ["x"]);
    expect(req.getHeader("rack.input").string()).toContain("<x>1</x>");
  });

  it("encodes a :json body with ActiveSupport::JSON.encode", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    req.setHeader("CONTENT_TYPE", "application/json");
    const price = new BigDecimal("1.50");
    req.assignParameters(null, "api", "create", { price, name: "<b>" }, "/api", ["price", "name"]);
    expect(req.getHeader("rack.input").string()).toBe(`{"price":"1.5","name":"\\u003cb\\u003e"}`);
  });
});

describe("ActionController::TestSession", () => {
  it("registers its Ruby constant path for Session#inspect's not-yet-loaded arm", () => {
    expect(TestSession.name).toBe("ActionController::TestSession");
  });
});

describe("TestRequest#assignParameters multipart body", () => {
  it("parses non-ASCII file bytes and text parts back out of the encoded body", () => {
    const req = TestRequest.create();
    req.setHeader("REQUEST_METHOD", "POST");
    const file = new UploadedFile(new StringIO(b("héllo")), "text/plain", false, {
      originalFilename: "h.txt",
    });
    req.assignParameters(null, "u", "create", { upload: file, t: "café" }, "/u", ["upload", "t"]);
    const body = req.getHeader("rack.input").string();
    expect(req.getHeader("CONTENT_LENGTH")).toBe(String(body.length));
    expect((req.requestParameters["upload"] as HttpUploadedFile).read()).toBe(b("héllo"));
    expect(req.requestParameters["t"]).toBe("café");
  });
});

describe("TestSession#inspect", () => {
  it("renders the not-yet-loaded arm with the Ruby constant path", () => {
    const session = Object.create(TestSession.prototype) as TestSession;
    expect(session.inspect()).toMatch(
      /^#<ActionController::TestSession:0x[0-9a-f]+ not yet loaded>$/,
    );
  });
});

describe("TestCase._controllerClass", () => {
  it("is a class_attribute, so a subclass inherits the parent's controller class", () => {
    class PostsController extends Base {}
    class Base1 extends TestCase {}
    class Sub1 extends Base1 {}
    Base1.tests(PostsController);
    expect(Sub1.controllerClass).toBe(PostsController);
    expect(Sub1.is_controllerClass).toBe(true);
  });
});

describe("ActionController::Live under test_case.rb", () => {
  it("keeps the originals and runs the controller thread block inline", async () => {
    expect(originalNewControllerThread).toBe(liveNewControllerThread);
    expect(originalCleanUpThreadLocals).toBe(liveCleanUpThreadLocals);
    expect(Live.newControllerThread).toBe(newControllerThread);
    expect(LiveBuffer.queueSize).toBeNull();

    const order: string[] = [];
    const p = Live.newControllerThread.call({} as never, () => {
      order.push("inside");
    });
    order.push("after-call");
    await p;
    expect(order).toEqual(["inside", "after-call"]);
  });

  it("builds a LiveTestResponse for a controller that includes Live", async () => {
    class LiveController extends Base {}
    include(LiveController, Live);
    class LiveControllerTest extends TestCase {}
    LiveControllerTest.tests(LiveController);
    const tc = new LiveControllerTest();
    expect(tc.response).toBeUndefined();
    await tc.beforeSetup();
    expect(tc.response).toBeInstanceOf(LiveTestResponse);
  });
});

describe("TestCase::Behavior", () => {
  it("is the module TestCase includes", () => {
    expect(isModuleIncluded(TestCase, Behavior)).toBe(true);
    expect(Object.hasOwn(TestCase.prototype, "process")).toBe(false);
    expect(Object.hasOwn(TestCase, "tests")).toBe(true);
    expect(typeof TestCase.prototype.process).toBe("function");
  });

  it("is includable into a test class that is not an ActionController::TestCase", async () => {
    class PlainController extends Base {}
    class PlainTest extends ActiveSupportTestCase {}
    include(PlainTest, Behavior);
    const klass = PlainTest as unknown as typeof TestCase;
    klass.tests(PlainController);
    expect(klass.controllerClass).toBe(PlainController);
    const tc = new klass("test_plain");
    await tc.beforeSetup();
    expect(tc.controller).toBeInstanceOf(PlainController);
    expect(tc.request).toBeInstanceOf(TestRequest);
    expect(() => tc.assertTemplate()).toThrow(/extracted to a gem/);
  });
});

describe("TestCase#wrap_execution", () => {
  class HeadController extends Base {
    async index() {
      this.head("ok");
    }
  }

  async function request(): Promise<TestCase> {
    const tc = new TestCase();
    tc.controller = new HeadController();
    await tc.beforeSetup();
    expect(await tc.get("index")).toBe(tc.response);
    return tc;
  }

  it("wraps the dispatch in the application executor when executor_around_each_request is set", async () => {
    const trails = TopLevel.Trails;
    let wrapped = 0;
    const executor = {
      wrap<T>(block: () => T): T {
        wrapped += 1;
        return block();
      },
    };
    TopLevel.Trails = { application: { executor } } as unknown as typeof trails;
    try {
      await request();
      expect(wrapped).toBe(0);
      TestCase.executorAroundEachRequest = true;
      const tc = await request();
      expect(wrapped).toBe(1);
      expect(tc.response.status).toBe(200);
    } finally {
      TestCase.executorAroundEachRequest = false;
      TopLevel.Trails = trails;
    }
  });
});

describe("TestCase#check_required_ivars", () => {
  it("names the unset ivar when a request is made with no routes", async () => {
    await expect(new TestCase().get("index")).rejects.toThrow(
      "@routes is nil: make sure you set it in your test's setup method.",
    );
  });
});

describe("TestCase#document_root_element", () => {
  class XmlController extends Base {
    async index() {
      await this.render({ xml: "<root><child/></root>" });
    }
  }

  it("parses the response as XML and resets it on the next request", async () => {
    const tc = new TestCase();
    tc.controller = new XmlController();
    await tc.beforeSetup();
    await tc.get("index");
    const first = tc.htmlDocument;
    expect(tc["documentRootElement"].name).toBe("root");
    await tc.get("index");
    expect(tc.htmlDocument).not.toBe(first);
  });
});
