import { describe, it, afterEach, beforeEach, vi } from "vitest";
import { registerConstant, stderr, StringIO } from "@blazetrails/ruby-compat";
import { assert, assertEqual, assertRaise, Logger } from "@blazetrails/activesupport";
import { Base } from "../../../action-controller/base.js";
import { ParseError } from "../../http/parameters.js";
import { MimeType } from "../../mime-type.js";
import { deprecator } from "../../deprecator.js";
import { IntegrationTest } from "../../testing/integration.js";
import type { RouteSet } from "../../routing/route-set.js";
import type { MountableApp } from "../../routing/mapper.js";
import "../../../test-helpers/abstract-unit.js";

class JsonParamsParsingTest extends IntegrationTest {}
registerConstant("JsonParamsParsingTest", JsonParamsParsingTest);

describe("JsonParamsParsingTest", () => {
  class TestController extends Base {
    static lastRequestParameters: Record<string, unknown> | null = null;

    async parse(): Promise<void> {
      TestController.lastRequestParameters = this.request.requestParameters;
      await this.head(":ok");
    }
  }

  let t: JsonParamsParsingTest;
  beforeEach(({ testCase }) => {
    t = testCase as JsonParamsParsingTest;
  });

  afterEach(() => {
    TestController.lastRequestParameters = null;
  });

  it("parses JSON params for application JSON", async () => {
    await assertParses({ person: { name: "David" } }, '{"person": {"name": "David"}}', {
      CONTENT_TYPE: "application/json",
    });
  });

  it("parses boolean and number JSON params for application JSON", async () => {
    await assertParses(
      { item: { enabled: false, count: 10 } },
      '{"item": {"enabled": false, "count": 10}}',
      { CONTENT_TYPE: "application/json" },
    );
  });

  it("parses JSON params for application jsonrequest", async () => {
    await assertParses({ person: { name: "David" } }, '{"person": {"name": "David"}}', {
      CONTENT_TYPE: "application/jsonrequest",
    });
  });

  it("parses JSON params for application problem+json", async () => {
    await assertParses({ person: { name: "David" } }, '{"person": {"name": "David"}}', {
      CONTENT_TYPE: "application/problem+json",
    });
  });

  it("does not parse unregistered media types such as application/vnd.api+json", async () => {
    await assertParses({}, '{"person": {"name": "David"}}', {
      CONTENT_TYPE: "application/vnd.api+json",
    });
  });

  it("nils are stripped from collections", async () => {
    await assertParses({ person: [] }, '{"person":[null]}', { CONTENT_TYPE: "application/json" });
    await assertParses({ person: ["foo"] }, '{"person":["foo",null]}', {
      CONTENT_TYPE: "application/json",
    });
    await assertParses({ person: [] }, '{"person":[null, null]}', {
      CONTENT_TYPE: "application/json",
    });
  });

  it("logs error if parsing unsuccessful", async () => {
    await withTestRouting(async () => {
      const output = new StringIO();
      const json = '["person]": {"name": "David"}}';
      await t.post("/parse", {
        params: json,
        headers: {
          CONTENT_TYPE: "application/json",
          "action_dispatch.show_exceptions": "all",
          "action_dispatch.logger": new Logger(output),
        },
      });
      t.assertResponse(":bad_request");
      output.rewind();
      const err = output.read();
      assert(/Error occurred while parsing request parameters/.test(err));
    });
  });

  it("occurring a parse error if parsing unsuccessful", async () => {
    await withTestRouting(async () => {
      const suppress = vi.spyOn(stderr, "write").mockImplementation(() => true);
      try {
        const json = '["person]": {"name": "David"}}';
        const exception = await assertRaise([ParseError], {}, () =>
          t.post("/parse", {
            params: json,
            headers: {
              CONTENT_TYPE: "application/json",
              "action_dispatch.show_exceptions": "none",
            },
          }),
        );
        assertEqual(SyntaxError, (exception.cause as Error).constructor);
        assertEqual("Error occurred while parsing request parameters", exception.message);
      } finally {
        suppress.mockRestore();
      }
    });
  });

  it("raw_post is not empty for JSON request", async () => {
    await withTestRouting(async () => {
      await t.post("/parse", {
        params: '{"posts": [{"title": "Post Title"}]}',
        headers: { CONTENT_TYPE: "application/json" },
      });
      assertEqual('{"posts": [{"title": "Post Title"}]}', t.request.rawPost);
    });
  });

  async function assertParses(
    expected: Record<string, unknown>,
    actual: string,
    headers: Record<string, unknown> = {},
  ): Promise<void> {
    await withTestRouting(async () => {
      await t.post("/parse", { params: actual, headers });
      t.assertResponse(":ok");
      assertEqual(expected, TestController.lastRequestParameters);
    });
  }

  async function withTestRouting<T>(block: () => Promise<T>): Promise<T> {
    return t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.post("/:action", { to: TestController as unknown as MountableApp });
        });
      });
      return block();
    });
  }
});

class RootLessJSONParamsParsingTest extends IntegrationTest {}
registerConstant("RootLessJSONParamsParsingTest", RootLessJSONParamsParsingTest);

describe("RootLessJSONParamsParsingTest", () => {
  class UsersController extends Base {
    static {
      this.wrapParameters({ format: ":json" });
    }

    static lastRequestParameters: Record<string, unknown> | null = null;
    static lastParameters: unknown = null;

    async parse(): Promise<void> {
      UsersController.lastRequestParameters = this.request.requestParameters;
      UsersController.lastParameters = this.params.toUnsafeH();
      await this.head(":ok");
    }
  }

  let t: RootLessJSONParamsParsingTest;
  beforeEach(({ testCase }) => {
    t = testCase as RootLessJSONParamsParsingTest;
  });

  afterEach(() => {
    UsersController.lastRequestParameters = null;
  });

  it("parses JSON params for application JSON", async () => {
    await assertParses(
      { user: { username: "sikachu" }, username: "sikachu" },
      '{"username": "sikachu"}',
      {
        CONTENT_TYPE: "application/json",
      },
    );
  });

  it("parses JSON params for application jsonrequest", async () => {
    await assertParses(
      { user: { username: "sikachu" }, username: "sikachu" },
      '{"username": "sikachu"}',
      {
        CONTENT_TYPE: "application/jsonrequest",
      },
    );
  });

  it("parses JSON params for application problem+json", async () => {
    await assertParses(
      { user: { username: "sikachu" }, username: "sikachu" },
      '{"username": "sikachu"}',
      {
        CONTENT_TYPE: "application/problem+json",
      },
    );
  });

  it("parses JSON with non-object JSON content", async () => {
    await assertParses(
      { user: { _json: "string content" }, _json: "string content" },
      '"string content"',
      { CONTENT_TYPE: "application/json" },
    );
  });

  it("parses JSON params after custom JSON mime type registered", async () => {
    try {
      MimeType.unregister(":json");
      MimeType.register("application/json", ":json", ["application/vnd.rails+json"]);
      await assertParses(
        { user: { username: "meinac" }, username: "meinac" },
        '{"username": "meinac"}',
        {
          CONTENT_TYPE: "application/json",
        },
      );
    } finally {
      MimeType.unregister(":json");
      MimeType.register("application/json", ":json", [
        "text/x-json",
        "application/jsonrequest",
        "application/problem+json",
      ]);
    }
  });

  it("parses JSON params after custom JSON mime type registered with synonym", async () => {
    try {
      MimeType.unregister(":json");
      MimeType.register("application/json", ":json", ["application/vnd.rails+json"]);
      await assertParses(
        { user: { username: "meinac" }, username: "meinac" },
        '{"username": "meinac"}',
        {
          CONTENT_TYPE: "application/vnd.rails+json",
        },
      );
    } finally {
      MimeType.unregister(":json");
      MimeType.register("application/json", ":json", [
        "text/x-json",
        "application/jsonrequest",
        "application/problem+json",
      ]);
    }
  });

  async function assertParses(
    expected: Record<string, unknown>,
    actual: string,
    headers: Record<string, unknown> = {},
  ): Promise<void> {
    await withTestRouting(UsersController, async () => {
      await t.post("/parse", { params: actual, headers });
      t.assertResponse(":ok");
      assertEqual(expected, UsersController.lastRequestParameters);
      assertEqual({ ...expected, action: "parse" }, UsersController.lastParameters);
    });
  }

  async function withTestRouting<T>(controller: typeof Base, block: () => Promise<T>): Promise<T> {
    return t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.post("/:action", { to: controller as unknown as MountableApp });
        });
      });
      return block();
    });
  }
});
