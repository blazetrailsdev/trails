import { it, expect } from "vitest";
import { parseMultipart, extractMultipart, buildMultipart, ParamList } from "./multipart.js";

import { StringIO } from "@blazetrails/ruby-compat";
import { MockRequest } from "./mock-request.js";
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

function envFor(data: string, contentType: string): Record<string, any> {
  return {
    CONTENT_TYPE: contentType,
    CONTENT_LENGTH: String(data.length),
    "rack.input": new StringIO(data),
  };
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

it("rejects excessive mime header size", () => {
  const boundary = "AaB03x";
  const longHeader = "X-Custom: " + "a".repeat(32 * 1024);
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n${longHeader}\r\n\r\nval\r\n--${boundary}--\r\n`;
  const params = parseMultipart(envFor(body, `multipart/form-data; boundary=${boundary}`))!;
  expect(params["a"]).toBe("val");
});

it("parses when the MIME head terminator straddles the BUFSIZE boundary", () => {
  const boundary = "AaB03x";
  const padding = "X-Padding: " + "a".repeat(16370) + "\r\n";
  const body = `--${boundary}\r\n${padding}content-disposition: form-data; name="a"\r\n\r\nval\r\n--${boundary}--\r\n`;
  const params = parseMultipart(envFor(body, `multipart/form-data; boundary=${boundary}`))!;
  expect(params["a"]).toBe("val");
});

it("allows large nonbuffered mime parameters", () => {
  const boundary = "AaB03x";
  const largeContent = "x".repeat(256 * 1024);
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="f"; filename="big.bin"\r\ncontent-type: application/octet-stream\r\n\r\n${largeContent}\r\n--${boundary}--\r\n`;
  const params = parseMultipart(envFor(body, `multipart/form-data; boundary=${boundary}`))!;
  expect(params["f"].filename).toBe("big.bin");
  expect(params["f"].tempfile.read().length).toBe(256 * 1024);
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
