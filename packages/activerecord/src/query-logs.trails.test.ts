import { describe, it, expect, afterEach } from "vitest";
import { ArgumentError, ExecutionContext } from "@blazetrails/activesupport";
import "./index.js";
import { QueryLogs, GetKeyHandler } from "./query-logs.js";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";

describe("GetKeyHandler", () => {
  it("looks up a named key in the context hash", () => {
    const handler = new GetKeyHandler("controller");
    expect(handler.call({ controller: "UsersController" })).toBe("UsersController");
  });

  it("returns undefined when the key is absent", () => {
    expect(new GetKeyHandler("missing").call({})).toBeUndefined();
  });

  it("is used by QueryLogs string-tag resolution", () => {
    QueryLogs.tags = ["controller"];
    ExecutionContext.setKey("controller", "UsersController");
    expect(QueryLogs.tagContent()).toBe("controller:UsersController");
    QueryLogs.tags = [];
  });
});

describe("LegacyFormatter", () => {
  it("formats as 'key:value'", () => {
    expect(LegacyFormatter.format("app", "MyApp")).toBe("app:MyApp");
  });

  it("joins with ','", () => {
    expect(LegacyFormatter.join(["a:1", "b:2"])).toBe("a:1,b:2");
  });
});

describe("QueryLogs.tagsFormatter", () => {
  afterEach(() => {
    QueryLogs.tagsFormatter = "legacy";
  });

  it("tracks the formatter name", () => {
    QueryLogs.tagsFormatter = "sqlcommenter";
    expect(QueryLogs.tagsFormatter).toBe("sqlcommenter");
  });

  it("raises ArgumentError for an unsupported formatter", () => {
    expect(() => (QueryLogs.tagsFormatter = "bogus")).toThrow(ArgumentError);
    expect(() => (QueryLogs.tagsFormatter = "bogus")).toThrow("Formatter is unsupported: bogus");
    expect(QueryLogs.tagsFormatter).toBe("legacy");
  });
});

describe("QueryLogs handlers", () => {
  afterEach(() => {
    QueryLogs.tags = [];
    ExecutionContext.clear();
  });

  it("calls an arity-0 hash tag with no context argument", () => {
    const received: number[] = [];
    QueryLogs.tags = [
      {
        zero: function () {
          received.push(arguments.length);
          return "z";
        },
        one: (ctx) => String(ctx !== undefined),
      },
    ];
    expect(QueryLogs.tagContent()).toBe("one:true,zero:z");
    expect(received).toEqual([0]);
  });

  it("resolves a false hash tag like Ruby's ||=", () => {
    QueryLogs.tags = [{ controller: false }];
    ExecutionContext.setKey("controller", "Users");
    expect(QueryLogs.tagContent()).toBe("controller:Users");
  });

  it("rebuilds handlers when taggings change", () => {
    const saved = QueryLogs.taggings;
    try {
      QueryLogs.tags = ["application"];
      QueryLogs.taggings = { ...saved, application: "tagged" };
      expect(QueryLogs.tagContent()).toBe("application:tagged");
    } finally {
      QueryLogs.taggings = saved;
    }
  });
});

describe("SQLCommenter", () => {
  it("formats as OpenTelemetry key='value' with URL-encoding", () => {
    expect(SQLCommenter.format("app", "My App")).toBe("app='My%20App'");
  });

  it("encodes single quotes as %27", () => {
    expect(SQLCommenter.format("k", "v'x")).toBe("k='v%27x'");
  });

  it("joins with ','", () => {
    expect(SQLCommenter.join(["a='1'", "b='2'"])).toBe("a='1',b='2'");
  });
});
