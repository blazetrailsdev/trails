import { describe, expect, it } from "vitest";
import { QueryParser, Params, ParamsTooDeepError, QueryLimitError } from "./query-parser.js";

describe("Rack::QueryParser::Params", () => {
  it("does not write through Object.prototype for a __proto__ key", () => {
    const parsed = QueryParser.makeDefault(100).parseNestedQuery("__proto__[x]=1");
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(parsed["__proto__"]).toEqual({ x: "1" });
  });

  it("carries the trails Hash seat so a nested container is a plain object", () => {
    const parsed = QueryParser.makeDefault(100).parseNestedQuery("a[b]=1");
    expect(Object.getPrototypeOf(parsed["a"])).toBeNull();
    expect(parsed["a"]).toBeInstanceOf(Params);
  });

  it("to_params_hash copies the container into a bare hash", () => {
    const params = new Params();
    params["a"] = "1";
    expect(params.toParamsHash()).toEqual({ a: "1" });
  });
});

describe("Rack::QueryParser::ParamsTooDeepError", () => {
  it("is the same constant as QueryLimitError", () => {
    expect(ParamsTooDeepError).toBe(QueryLimitError);
    expect(new QueryLimitError("x")).toBeInstanceOf(ParamsTooDeepError);
    expect(new ParamsTooDeepError("x")).toBeInstanceOf(QueryLimitError);
    expect(new ParamsTooDeepError("x").name).toBe("QueryLimitError");
  });
});
