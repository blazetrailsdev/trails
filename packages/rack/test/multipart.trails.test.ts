import { it, expect } from "vitest";
import { parseMultipart, extractMultipart, buildMultipart, ParamList } from "../lib/multipart.js";

import { StringIO } from "@blazetrails/ruby-compat";
import { MockRequest } from "../lib/mock-request.js";
import * as fs from "fs";
import * as path from "path";

function multipartFile(name: string): string {
  return path.join(__dirname, "..", "test", "multipart", name);
}

function multipartFixture(name: string, boundary = "AaB03x"): Record<string, any> {
  const file = multipartFile(name);
  const data = fs.readFileSync(file, "binary");

  const type = `multipart/form-data; boundary=${boundary}`;
  const length = data.length;

  return { CONTENT_TYPE: type, CONTENT_LENGTH: String(length), ":input": new StringIO(data) };
}

function parseFixture(name: string, boundary = "AaB03x"): Record<string, any> | null {
  const env = MockRequest.envFor("/", multipartFixture(name, boundary));
  return parseMultipart(env);
}

it("supports ISO-2022-JP-encoded part", () => {
  const params = parseFixture("multiple_encodings")!;
  expect(params["us-ascii"]).toBe("Alice");
  expect(params["iso-2022-jp"]).toBeDefined();
});

it("extractMultipart delegates to parseMultipart via request.env", () => {
  const result = extractMultipart({
    env: MockRequest.envFor("/", multipartFixture("content_type_and_no_filename")),
  });
  expect(result).toEqual(
    parseMultipart(MockRequest.envFor("/", multipartFixture("content_type_and_no_filename"))),
  );
});

it("buildMultipart returns null when no UploadedFile present and first=true", () => {
  const result = buildMultipart({ foo: "bar" });
  expect(result).toBeNull();
});

it("buildMultipart returns flattened params hash when first=false", () => {
  const result = buildMultipart({ name: "Larry" }, false) as Record<string, unknown>;
  expect(result).toEqual({ "[name]": "Larry" });
});

it("ParamList.makeParams returns a new ParamList", () => {
  const list = ParamList.makeParams();
  expect(list).toBeInstanceOf(ParamList);
  expect(list.toParamsHash()).toEqual([]);
});

it("ParamList.normalizeParams appends a key-value pair", () => {
  const list = ParamList.makeParams();
  ParamList.normalizeParams(list, "foo", "bar");
  expect(list.toParamsHash()).toEqual([["foo", "bar"]]);
});

it("ParamList#toParamsHash returns accumulated pairs", () => {
  const list = ParamList.makeParams();
  list.push(["a", "1"]);
  list.push(["b", "2"]);
  expect(list.toParamsHash()).toEqual([
    ["a", "1"],
    ["b", "2"],
  ]);
});
