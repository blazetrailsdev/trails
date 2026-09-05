import { describe, it, expect } from "vitest";
import { ArgumentError, File, StringIO, b } from "@blazetrails/ruby-compat";
import { MockRequest, Multipart } from "@blazetrails/rack";
import { Utils } from "./utils.js";
import { MULTIPART_BOUNDARY } from "./test.js";
import { UploadedFile } from "./uploaded-file.js";

function multipartFile(name: string): string {
  return File.join(File.dirname(new URL(import.meta.url).pathname), "fixtures", name);
}

function parseData(data: string) {
  const options = {
    CONTENT_TYPE: `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
    CONTENT_LENGTH: String(data.length),
    ":input": new StringIO(data),
  };
  const env = MockRequest.envFor("/", options);
  return Multipart.parseMultipart(env);
}

describe("Rack::Test::Utils#build_nested_query", () => {
  it("converts empty strings to =", () => {
    expect(Utils.buildNestedQuery("")).toBe("=");
  });

  it("converts nil to an empty string", () => {
    expect(Utils.buildNestedQuery(null)).toBe("");
  });

  it("converts hashes with nil values", () => {
    expect(Utils.buildNestedQuery({ a: null })).toBe("a");
  });

  it("converts hashes", () => {
    expect(Utils.buildNestedQuery({ a: 1 })).toBe("a=1");
  });

  it("converts hashes with multiple keys", () => {
    const hash = { a: 1, b: 2 };
    expect(Utils.buildNestedQuery(hash)).toBe("a=1&b=2");
  });

  it("converts empty arrays", () => {
    expect(Utils.buildNestedQuery({ a: [] })).toBe("a[]=");
  });

  it("converts arrays with one element", () => {
    expect(Utils.buildNestedQuery({ a: [1] })).toBe("a[]=1");
  });

  it("converts arrays with multiple elements", () => {
    expect(Utils.buildNestedQuery({ a: [1, 2] })).toBe("a[]=1&a[]=2");
  });

  it("converts arrays with brackets '[]' in the name", () => {
    expect(Utils.buildNestedQuery({ "a[]": [1, 2] })).toBe("a%5B%5D=1&a%5B%5D=2");
  });

  it("converts nested hashes", () => {
    expect(Utils.buildNestedQuery({ a: { b: 1 } })).toBe("a[b]=1");
  });

  it("converts arrays nested in a hash", () => {
    expect(Utils.buildNestedQuery({ a: { b: [1, 2] } })).toBe("a[b][]=1&a[b][]=2");
  });

  it("converts arrays of hashes", () => {
    expect(Utils.buildNestedQuery({ a: [{ b: 2 }, { c: 3 }] })).toBe("a[][b]=2&a[][c]=3");
  });

  it("supports hash keys with empty arrays", () => {
    const input = { collection: [] };
    expect(Utils.buildNestedQuery(input)).toBe("collection[]=");
  });
});

describe("Rack::Test::Utils.build_multipart", () => {
  it("builds multipart bodies", () => {
    const files = new UploadedFile(multipartFile("foo.txt"));
    const data = Utils.buildMultipart({ "submit-name": "Larry", files: files })!;

    const params = parseData(data);
    expect(params["submit-name"]).toBe("Larry");
    expect(params["files"]["filename"]).toBe("foo.txt");
    expect((files as unknown as { pos: number }).pos).toBe(0);
    expect(params["files"]["tempfile"].read()).toBe(files.tempfile.read());
  });

  it("handles uploaded files not responding to set_encoding as empty", () => {
    class C extends UploadedFile {
      constructor() {
        super(new StringIO(""), "application/octet-stream", false, { originalFilename: "" });
        (this as { tempfile?: unknown }).tempfile = undefined;
      }

      get size(): number {
        return 0;
      }

      read(): string {
        return "";
      }
    }

    const data = Utils.buildMultipart({ "submit-name": "Larry", files: new C() })!;
    const params = parseData(data);
    expect(params["submit-name"]).toBe("Larry");
    expect(params["files"]).toBeUndefined();
    expect(data).toContain('content-disposition: form-data; name="files"; filename=""');
    expect(data).toContain("content-length: 0");
  });

  it("builds multipart bodies from array of files", () => {
    const files = [
      new UploadedFile(multipartFile("foo.txt")),
      new UploadedFile(multipartFile("bar.txt")),
    ];
    const data = Utils.buildMultipart({ "submit-name": "Larry", files: files })!;

    const params = parseData(data);
    expect(params["submit-name"]).toBe("Larry");

    expect(params["files"][0]["filename"]).toBe("foo.txt");
    expect(params["files"][0]["tempfile"].read()).toBe("bar\n");

    expect(params["files"][1]["filename"]).toBe("bar.txt");
    expect(params["files"][1]["tempfile"].read()).toBe("baz\n");
  });

  it("builds multipart bodies from mixed array of a file and a primitive", () => {
    const files = [new UploadedFile(multipartFile("foo.txt")), "baz"];
    const data = Utils.buildMultipart({ files: files })!;

    const params = parseData(data);

    expect(params["files"][0]["filename"]).toBe("foo.txt");
    expect(params["files"][0]["tempfile"].read()).toBe("bar\n");

    expect(params["files"][1]).toBe("baz");
  });

  it("builds nested multipart bodies", () => {
    const files = new UploadedFile(multipartFile("foo.txt"));
    const data = Utils.buildMultipart({
      people: [{ "submit-name": "Larry", files: files }],
      foo: ["1", "2"],
    })!;

    const params = parseData(data);
    expect(params["people"][0]["submit-name"]).toBe("Larry");
    expect(params["people"][0]["files"]["filename"]).toBe("foo.txt");
    expect(params["people"][0]["files"]["tempfile"].read()).toBe("bar\n");
    expect(params["foo"]).toEqual(["1", "2"]);
  });

  it("builds nested multipart bodies with UTF-8 data", () => {
    let files = new UploadedFile(multipartFile("mb.txt"));
    let data = Utils.buildMultipart({
      people: [{ "submit-name": "ሴ", files: files }],
      foo: ["1", "2"],
    })!;

    let params = parseData(data);
    expect(b(params["people"][0]["submit-name"])).toBe(b("ሴ"));
    expect(params["people"][0]["files"]["filename"]).toBe("mb.txt");
    expect(params["people"][0]["files"]["tempfile"].read()).toBe(b("⍅"));
    expect(params["foo"]).toEqual(["1", "2"]);

    files = new UploadedFile(multipartFile("mb.txt"));
    data = Utils.buildMultipart({
      people: [{ files: files, "submit-name": "ሴ" }],
      foo: ["1", "2"],
    })!;

    params = parseData(data);
    expect(b(params["people"][0]["submit-name"])).toBe(b("ሴ"));
    expect(params["people"][0]["files"]["filename"]).toBe("mb.txt");
    expect(params["people"][0]["files"]["tempfile"].read()).toBe(b("⍅"));
    expect(params["foo"]).toEqual(["1", "2"]);
  });

  it("builds nested multipart bodies with an array of hashes", () => {
    const files = new UploadedFile(multipartFile("foo.txt"));
    const data = Utils.buildMultipart({
      files: files,
      foo: [
        { id: "1", name: "Dave" },
        { id: "2", name: "Steve" },
      ],
    })!;

    const params = parseData(data);
    expect(params["files"]["filename"]).toBe("foo.txt");
    expect(params["files"]["tempfile"].read()).toBe("bar\n");
    expect(params["foo"]).toEqual([
      { id: "1", name: "Dave" },
      { id: "2", name: "Steve" },
    ]);
  });

  it("builds nested multipart bodies with arbitrarily nested array of hashes", () => {
    const files = new UploadedFile(multipartFile("foo.txt"));
    const data = Utils.buildMultipart({
      files: files,
      foo: {
        bar: [
          { id: "1", name: "Dave" },
          {
            id: "2",
            name: "Steve",
            qux: [
              { id: "3", name: "mike" },
              { id: "4", name: "Joan" },
            ],
          },
        ],
      },
    })!;

    const params = parseData(data);
    expect(params["files"]["filename"]).toBe("foo.txt");
    expect(params["files"]["tempfile"].read()).toBe("bar\n");
    expect(params["foo"]).toEqual({
      bar: [
        { id: "1", name: "Dave" },
        {
          id: "2",
          name: "Steve",
          qux: [
            { id: "3", name: "mike" },
            { id: "4", name: "Joan" },
          ],
        },
      ],
    });
  });

  it("does not break with params that look nested, but are not", () => {
    const files = new UploadedFile(multipartFile("foo.txt"));
    const data = Utils.buildMultipart({ "foo[]": "1", "bar[]": { qux: "2" }, "files[]": files })!;

    const params = parseData(data);
    expect(params["files"][0]["filename"]).toBe("foo.txt");
    expect(params["files"][0]["tempfile"].read()).toBe("bar\n");
    expect(params["foo"][0]).toBe("1");
    expect(params["bar"][0]).toEqual({ qux: "2" });
  });

  it("allows for nested files", () => {
    const files = new UploadedFile(multipartFile("foo.txt"));
    const data = Utils.buildMultipart({
      foo: [
        { id: "1", data: files },
        { id: "2", data: ["3", "4"] },
      ],
    })!;

    const params = parseData(data);
    expect(params["foo"][0]["id"]).toBe("1");
    expect(params["foo"][0]["data"]["filename"]).toBe("foo.txt");
    expect(params["foo"][0]["data"]["tempfile"].read()).toBe("bar\n");
    expect(params["foo"][1]).toEqual({ id: "2", data: ["3", "4"] });
  });

  it("returns nil if no UploadedFiles were used", () => {
    expect(
      Utils.buildMultipart({ people: [{ "submit-name": "Larry", files: "contents" }] }),
    ).toBeNull();
  });

  it("allows for forcing multipart uploads even without a file", () => {
    const data = Utils.buildMultipart({ foo: [{ id: "2", data: ["3", "4"] }] }, true, true)!;

    const params = parseData(data);
    expect(params["foo"][0]).toEqual({ id: "2", data: ["3", "4"] });
  });

  it("raises ArgumentErrors if params is not a Hash", () => {
    expect(() => Utils.buildMultipart("foo=bar")).toThrow(ArgumentError);
  });
});
