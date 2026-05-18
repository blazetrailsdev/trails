import { describe, expect, it } from "vitest";
import {
  EXCLUDE_PARAMETERS,
  Options,
  _defaultWrapModel,
  _extractParameters,
  _performParameterWrapping,
  _setWrapperOptions,
  _wrapParameters,
  _wrapperFormats,
  _wrapperKey,
  _wrapperEnabled,
  type ParamsWrapperHost,
} from "./params-wrapper.js";

function makeHost(
  opts: Partial<Options> = {},
  requestOverrides: Partial<ParamsWrapperHost["request"]> = {},
): ParamsWrapperHost {
  const merged = new Options(
    opts.name ?? null,
    opts.format ?? null,
    opts.include ?? null,
    opts.exclude ?? null,
    opts.klass ?? null,
    opts.model ?? null,
  );
  const request: ParamsWrapperHost["request"] = {
    hasContentType: () => true,
    contentMimeType: { ref: () => "json" },
    requestParameters: {},
    filteredParameters: () => ({}),
    parameters: {},
    ...requestOverrides,
  };
  return { _wrapperOptions: merged, request };
}

describe("ParamsWrapper privates", () => {
  it("_wrapperKey returns Options.name", () => {
    expect(_wrapperKey.call(makeHost({ name: "user" }))).toBe("user");
    expect(_wrapperKey.call(makeHost())).toBeNull();
  });

  it("_wrapperFormats returns Options.format", () => {
    expect(_wrapperFormats.call(makeHost({ format: ["json", "xml"] }))).toEqual(["json", "xml"]);
  });

  it("_extractParameters slices by include when set", () => {
    const host = makeHost({ include: ["name"] });
    expect(_extractParameters.call(host, { name: "a", age: 1 })).toEqual({ name: "a" });
  });

  it("_extractParameters drops exclude + EXCLUDE_PARAMETERS when exclude set", () => {
    const host = makeHost({ exclude: ["admin"] });
    expect(
      _extractParameters.call(host, {
        name: "a",
        admin: true,
        _method: "x",
        authenticity_token: "t",
      }),
    ).toEqual({ name: "a" });
  });

  it("_extractParameters drops only EXCLUDE_PARAMETERS by default", () => {
    const host = makeHost();
    expect(_extractParameters.call(host, { name: "a", utf8: "✓" })).toEqual({ name: "a" });
    expect(EXCLUDE_PARAMETERS).toContain("utf8");
  });

  it("_wrapParameters wraps under wrapper key", () => {
    const host = makeHost({ name: "user", include: ["name"] });
    expect(_wrapParameters.call(host, { name: "Dean", age: 30 })).toEqual({
      user: { name: "Dean" },
    });
  });

  it("_wrapParameters returns empty object when no key", () => {
    expect(_wrapParameters.call(makeHost(), { name: "x" })).toEqual({});
  });

  it("_wrapperEnabled true when format matches and key absent", () => {
    const host = makeHost(
      { name: "user", format: ["json"] },
      { requestParameters: { name: "a" }, parameters: { name: "a" } },
    );
    expect(_wrapperEnabled.call(host)).toBe(true);
  });

  it("_wrapperEnabled false when wrapper key already present", () => {
    const host = makeHost({ name: "user", format: ["json"] }, { parameters: { user: {} } });
    expect(_wrapperEnabled.call(host)).toBe(false);
  });

  it("_wrapperEnabled false when format does not match", () => {
    const host = makeHost(
      { name: "user", format: ["xml"] },
      { contentMimeType: { ref: () => "json" } },
    );
    expect(_wrapperEnabled.call(host)).toBe(false);
  });

  it("_wrapperEnabled false when no content type", () => {
    const host = makeHost({ name: "user", format: ["json"] }, { hasContentType: () => false });
    expect(_wrapperEnabled.call(host)).toBe(false);
  });

  it("_wrapperEnabled false on parse error (rescue)", () => {
    const host = makeHost(
      { name: "user", format: ["json"] },
      {
        hasContentType: () => {
          throw new Error("boom");
        },
      },
    );
    expect(_wrapperEnabled.call(host)).toBe(false);
  });

  it("_performParameterWrapping merges into request hashes", () => {
    const requestParameters: Record<string, unknown> = { name: "Dean", age: 30 };
    const parameters: Record<string, unknown> = { ...requestParameters };
    const filtered: Record<string, unknown> = { name: "Dean", age: 30 };
    const host = makeHost(
      { name: "user", include: ["name"] },
      {
        requestParameters,
        parameters,
        filteredParameters: () => filtered,
      },
    );
    _performParameterWrapping.call(host);
    expect(parameters.user).toEqual({ name: "Dean" });
    expect(requestParameters.user).toEqual({ name: "Dean" });
    expect(filtered.user).toEqual({ name: "Dean" });
  });

  it("_setWrapperOptions replaces _wrapperOptions via Options.fromHash", () => {
    const host: { _wrapperOptions: Options } = { _wrapperOptions: new Options() };
    _setWrapperOptions.call(host, { name: "user", format: ["json"] });
    expect(host._wrapperOptions.name).toBe("user");
    expect(host._wrapperOptions.format).toEqual(["json"]);
  });

  it("_defaultWrapModel derives snake_case singular from controller class name", () => {
    expect(
      _defaultWrapModel.call({
        _wrapperOptions: new Options(null, null, null, null, { name: "UsersController" }, null),
      }),
    ).toBe("user");

    expect(
      _defaultWrapModel.call({
        _wrapperOptions: new Options(
          null,
          null,
          null,
          null,
          { name: "Admin::PostsController" },
          null,
        ),
      }),
    ).toBe("post");
  });

  it("_defaultWrapModel returns null for unnamed (anonymous) klass", () => {
    expect(_defaultWrapModel.call({ _wrapperOptions: new Options() })).toBeNull();
  });
});
