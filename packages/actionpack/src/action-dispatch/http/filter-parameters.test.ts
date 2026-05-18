import { describe, expect, it } from "vitest";
import { ParameterFilter } from "@blazetrails/activesupport";
import {
  ENV_MATCH,
  NULL_ENV_FILTER,
  NULL_PARAM_FILTER,
  type FilterParametersHost,
  envFilter,
  filteredEnv,
  filteredParameters,
  filteredPath,
  parameterFilter,
  parameterFilterFor,
} from "./filter-parameters.js";
import { ParseError } from "./parameters.js";

function makeHost(overrides: Partial<FilterParametersHost> = {}): FilterParametersHost {
  const headers = new Map<string, unknown>();
  const env: Record<string, unknown> = {};
  return {
    getHeader: (k) => headers.get(k),
    setHeader: (k, v) => {
      headers.set(k, v);
      return v;
    },
    deleteHeader: (k) => {
      headers.delete(k);
    },
    hasHeader: (k) => headers.has(k),
    queryParameters: {},
    requestParameters: {},
    contentLength: 0,
    contentMimeType: null,
    rawPost: "",
    env,
    path: "/",
    queryString: "",
    parameters: () => ({}),
    ...overrides,
  };
}

describe("ENV_MATCH", () => {
  it("matches Rails' static env filter list", () => {
    expect(ENV_MATCH).toEqual([/RAW_POST_DATA/, "rack.request.form_vars"]);
  });
});

describe("filteredParameters", () => {
  it("returns parameters filtered by the configured filter list", () => {
    const host = makeHost({
      parameters: () => ({ password: "secret", username: "alice" }),
    });
    host.setHeader("action_dispatch.parameter_filter", ["password"]);
    expect(filteredParameters.call(host)).toEqual({
      password: "[FILTERED]",
      username: "alice",
    });
  });

  it("returns an empty hash when parameters() throws ParseError", () => {
    const host = makeHost({
      parameters: () => {
        throw new ParseError("bad");
      },
    });
    expect(filteredParameters.call(host)).toEqual({});
  });

  it("rethrows non-ParseError exceptions", () => {
    const host = makeHost({
      parameters: () => {
        throw new TypeError("boom");
      },
    });
    expect(() => filteredParameters.call(host)).toThrow(TypeError);
  });

  it("memoizes the filtered hash", () => {
    let calls = 0;
    const host = makeHost({
      parameters: () => {
        calls++;
        return {};
      },
    });
    filteredParameters.call(host);
    filteredParameters.call(host);
    expect(calls).toBe(1);
  });
});

describe("filteredEnv", () => {
  it("filters env keys matching the configured filter list plus ENV_MATCH", () => {
    const host = makeHost({
      env: { password: "secret", RAW_POST_DATA: "x", safe: "ok" },
    });
    host.setHeader("action_dispatch.parameter_filter", ["password"]);
    const out = filteredEnv.call(host);
    expect(out["password"]).toBe("[FILTERED]");
    expect(out["RAW_POST_DATA"]).toBe("[FILTERED]");
    expect(out["safe"]).toBe("ok");
  });

  it("uses NULL_ENV_FILTER when no filter header is set", () => {
    const host = makeHost({ env: { foo: "bar", RAW_POST_DATA: "x" } });
    const out = filteredEnv.call(host);
    expect(out["foo"]).toBe("bar");
    expect(out["RAW_POST_DATA"]).toBe("[FILTERED]");
  });
});

describe("filteredPath", () => {
  it("returns just the path when there is no query string", () => {
    const host = makeHost({ path: "/users", queryString: "" });
    expect(filteredPath.call(host)).toBe("/users");
  });

  it("appends the filtered query string", () => {
    const host = makeHost({ path: "/users", queryString: "password=hunter2&name=al" });
    host.setHeader("action_dispatch.parameter_filter", ["password"]);
    expect(filteredPath.call(host)).toBe("/users?password=[FILTERED]&name=al");
  });
});

describe("parameterFilter", () => {
  it("returns NULL_PARAM_FILTER when the header is unset", () => {
    expect(parameterFilter.call(makeHost())).toBe(NULL_PARAM_FILTER);
  });

  it("constructs a ParameterFilter from the header list", () => {
    const host = makeHost();
    host.setHeader("action_dispatch.parameter_filter", ["secret"]);
    const f = parameterFilter.call(host);
    expect(f).toBeInstanceOf(ParameterFilter);
    expect(f).not.toBe(NULL_PARAM_FILTER);
  });
});

describe("envFilter", () => {
  it("returns NULL_ENV_FILTER when no header is set", () => {
    expect(envFilter.call(makeHost())).toBe(NULL_ENV_FILTER);
  });

  it("appends ENV_MATCH to the user filter list", () => {
    const host = makeHost({ env: { user_key: "x", RAW_POST_DATA: "y" } });
    host.setHeader("action_dispatch.parameter_filter", ["user_key"]);
    const out = envFilter.call(host).filter(host.env);
    expect(out["user_key"]).toBe("[FILTERED]");
    expect(out["RAW_POST_DATA"]).toBe("[FILTERED]");
  });
});

describe("parameterFilterFor", () => {
  it("constructs a ParameterFilter from the given list", () => {
    expect(parameterFilterFor(["x"])).toBeInstanceOf(ParameterFilter);
  });
});
