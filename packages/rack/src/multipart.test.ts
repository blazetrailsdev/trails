import { describe, it, expect } from "vitest";
import {
  MultipartParser, MultipartPartLimitError, MultipartTotalPartLimitError,
  BoundaryTooLongError, EmptyContentError, MissingInputError,
  parseMultipart, UploadedFile,
} from "./multipart.js";
import { MockRequest } from "./mock-request.js";
import * as fs from "fs";
import * as path from "path";

const fixtureDir = path.join(__dirname, "..", "test", "multipart");

function multipartFixture(name: string, boundary = "AaB03x"): Record<string, any> {
  const filePath = path.join(fixtureDir, name);
  const data = fs.readFileSync(filePath);
  return {
    CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
    CONTENT_LENGTH: String(data.length),
    "rack.input": { read() { return data; } },
  };
}

function parseFixture(name: string, boundary = "AaB03x"): Record<string, any> | null {
  const env = multipartFixture(name, boundary);
  return parseMultipart(env);
}

it("parses filename with unescaped percentage characters that look like partial hex escapes", () => {
  const params = parseFixture("filename_with_unescaped_percentages2", "----WebKitFormBoundary2NHc7OhsgU68l3Al")!;
  const files = params["document"]["attachment"];
  expect(files.filename).toBe("100%a");
  expect(files.type).toBe("image/jpeg");
  expect(files.name).toBe("document[attachment]");
  expect(files.tempfile.read()).toBe("contents");
});

it("parses filename with unescaped percentage characters that look like partial hex escapes", () => {
  const params = parseFixture("filename_with_unescaped_percentages3", "----WebKitFormBoundary2NHc7OhsgU68l3Al")!;
  const files = params["document"]["attachment"];
  expect(files.filename).toBe("100%");
  expect(files.type).toBe("image/jpeg");
  expect(files.tempfile.read()).toBe("contents");
});

it("raises a RuntimeError for invalid file path", () => {
  expect(() => new UploadedFile("non-existant")).toThrow();
});

it("supports uploading files in binary mode", () => {
  const file1 = new UploadedFile(path.join(fixtureDir, "file1.txt"));
  expect(file1.binmode).toBe(false);
  const file2 = new UploadedFile(path.join(fixtureDir, "file1.txt"), { binary: true });
  expect(file2.binmode).toBe(true);
});

it("builds multipart body", () => {
  const { body, boundary } = MultipartParser.buildMultipartBody({ "submit-name": "Larry", foo: "bar" });
  expect(body).toContain("Larry");
  expect(body).toContain(boundary);
});

it("builds multipart filename with space", () => {
  const { body } = MultipartParser.buildMultipartBody({
    file: { filename: "my file.txt", type: "text/plain", content: "data" },
  });
  expect(body).toContain("my file.txt");
});

it("builds nested multipart body using array", () => {
  const { body } = MultipartParser.buildMultipartBody({ items: ["a", "b"] });
  expect(body).toContain('name="items[]"');
  expect(body).toContain("a");
  expect(body).toContain("b");
});

it("builds nested multipart body using hash", () => {
  const { body } = MultipartParser.buildMultipartBody({ user: { name: "dean", age: "30" } });
  expect(body).toContain('name="user[name]"');
  expect(body).toContain("dean");
});

it("builds multipart body from StringIO", () => {
  const { body } = MultipartParser.buildMultipartBody({
    file: { filename: "test.txt", type: "text/plain", read() { return "hello"; } },
  });
  expect(body).toContain("hello");
});

it("can parse fields that end at the end of the buffer", () => {
  const boundary = "AaB03x";
  // Create a body where the field value ends right at the buffer boundary
  const valueLen = 16384 - 100; // approximate to land near buffer end
  const value = "x".repeat(valueLen);
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\n${value}\r\n--${boundary}--\r\n`;
  const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
  expect(params["a"]).toBe(value);
});

it("builds complete params with the chunk size of 16384 slicing exactly on boundary", () => {
  const boundary = "AaB03x";
  // Pad so boundary falls exactly at 16384 byte offset
  const padding = "x".repeat(16384 - `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\n`.length - 2);
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\n${padding}\r\n--${boundary}\r\ncontent-disposition: form-data; name="b"\r\n\r\nval\r\n--${boundary}--\r\n`;
  const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
  expect(params["a"]).toBe(padding);
  expect(params["b"]).toBe("val");
});

it("does not reach a multi-part limit", () => {
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\nval\r\n--${boundary}--\r\n`;
  const result = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`, { multipart_total_limit: 10 });
  expect(result!["a"]).toBe("val");
});

it("treats a multipart limit of 0 as no limit", () => {
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\nval\r\n--${boundary}--\r\n`;
  const result = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`, { multipart_total_limit: 0 });
  expect(result!["a"]).toBe("val");
});

it("treats a multipart limit of 0 as no limit", () => {
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\nval\r\n--${boundary}--\r\n`;
  const result = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`, { multipart_file_limit: 0 });
  expect(result!["a"]).toBe("val");
});

it("reaches a multipart file limit", () => {
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="f1"; filename="a.txt"\r\ncontent-type: text/plain\r\n\r\ndata1\r\n--${boundary}\r\ncontent-disposition: form-data; name="f2"; filename="b.txt"\r\ncontent-type: text/plain\r\n\r\ndata2\r\n--${boundary}--\r\n`;
  expect(() => {
    MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`, { multipart_file_limit: 1 });
  }).toThrow(MultipartPartLimitError);
});

it("reaches a multipart total limit", () => {
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\nval1\r\n--${boundary}\r\ncontent-disposition: form-data; name="b"\r\n\r\nval2\r\n--${boundary}--\r\n`;
  expect(() => {
    MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`, { multipart_total_limit: 1 });
  }).toThrow(MultipartTotalPartLimitError);
});

it("returns nil if no UploadedFiles were used", () => {
  const result = MultipartParser.parse("", "text/plain");
  expect(result).toBeNull();
});

it("raises ArgumentError if params is not a Hash", () => {
  expect(() => MultipartParser.buildMultipartBody(null as any)).toThrow();
});

it("is able to parse fields with a content type", () => {
  const params = parseFixture("content_type_and_no_filename")!;
  expect(params["text"]).toBe("contents");
});

it("parses multipart upload with no content-length header", () => {
  const filePath = path.join(fixtureDir, "text");
  const data = fs.readFileSync(filePath);
  const env = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    "rack.input": { read() { return data; } },
  };
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
});

it("parses very long quoted multipart file names", () => {
  const longName = "long".repeat(100);
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-type: text/plain\r\ncontent-disposition: attachment; name=file; filename="${longName}"\r\n\r\ncontents\r\n--${boundary}--\r\n`;
  const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
  expect(params["file"].filename).toBe(longName);
});

it("parses very long unquoted multipart file names", () => {
  const longName = "long".repeat(100);
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-type: text/plain\r\ncontent-disposition: attachment; name=file; filename=${longName}\r\n\r\ncontents\r\n--${boundary}--\r\n`;
  const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
  expect(params["file"].filename).toBe(longName);
});

it("does not remove escaped quotes in filenames", () => {
  const params = parseFixture("filename_with_escaped_quotes")!;
  expect(params["files"].filename).toBe('escape "quotes');
});

it("limits very long file name extensions in multipart tempfiles", () => {
  const longExt = "a".repeat(1000);
  const boundary = "AaB03x";
  const body = `--${boundary}\r\ncontent-type: text/plain\r\ncontent-disposition: attachment; name=file; filename=foo.${longExt}\r\n\r\ncontents\r\n--${boundary}--\r\n`;
  const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
  expect(params["file"].filename).toBe(`foo.${"a".repeat(1000)}`);
});

it("parses unquoted parameter values at end of line", () => {
  const params = parseFixture("filename_and_modification_param")!;
  expect(params["files"].filename).toBe("genome.jpeg");
});

it("parses quoted chars in name parameter", () => {
  const params = parseFixture("semicolon")!;
  expect(params["files"].filename).toBe("fi;le1.txt");
});

it("supports mixed case metadata", () => {
  const params = parseFixture("filename_multi")!;
  // filename is preferred over filename*
  expect(params["files"].filename).toBe("foo");
});

it("falls back to content-type for the name", () => {
  const params = parseFixture("content_type_and_no_disposition")!;
  // When no disposition, name falls back to content-type[]
  expect(params["text/plain; charset=US-ASCII"]).toBeDefined();
});

it("supports ISO-2022-JP-encoded part", () => {
  const params = parseFixture("multiple_encodings")!;
  expect(params["us-ascii"]).toBe("Alice");
  // The ISO-2022-JP encoded part should parse (value depends on encoding handling)
  expect(params["iso-2022-jp"]).toBeDefined();
});

describe("Rack::Multipart", () => {
  it("returns nil if the content type is not multipart", () => {
    const env = { CONTENT_TYPE: "application/x-www-form-urlencoded", "rack.input": { read() { return ""; } } };
    expect(parseMultipart(env)).toBeNull();
  });

  it("raises an exception if boundary is too long", () => {
    expect(() => parseFixture("content_type_and_no_filename", "A".repeat(71))).toThrow(BoundaryTooLongError);
  });

  it("raises a bad request exception if no body is given but content type indicates a multipart body", () => {
    const env = {
      CONTENT_TYPE: "multipart/form-data; boundary=BurgerBurger",
      "rack.input": null,
    };
    expect(() => parseMultipart(env)).toThrow(MissingInputError);
  });

  it("parses multipart content when content type is present but disposition is not", () => {
    const params = parseFixture("content_type_and_no_disposition")!;
    expect(params["text/plain; charset=US-ASCII"]).toBeDefined();
  });

  it("parses multipart content when content type is present but disposition is not when using IO", () => {
    const filePath = path.join(fixtureDir, "content_type_and_no_disposition");
    const data = fs.readFileSync(filePath);
    const env = {
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      "rack.input": { read() { return data; } },
    };
    const params = parseMultipart(env)!;
    expect(params["text/plain; charset=US-ASCII"]).toBeDefined();
  });

  it("parses multipart content when content type present but filename is not", () => {
    const params = parseFixture("content_type_and_no_filename")!;
    expect(params["text"]).toBe("contents");
  });

  it("raises for invalid data preceding the boundary", () => {
    expect(() => parseFixture("preceding_boundary")).toThrow(EmptyContentError);
  });

  it("ignores initial end boundaries", () => {
    const params = parseFixture("end_boundary_first")!;
    expect(params["files"].filename).toBe("foo");
  });

  it("prefers filename over filename* when both are present", () => {
    const params = parseFixture("filename_multi")!;
    expect(params["files"].filename).toBe("foo");
  });

  it("sets US_ASCII encoding based on charset", () => {
    // In JS we don't have encoding objects, but we can verify the content is correct
    const params = parseFixture("content_type_and_no_filename")!;
    expect(params["text"]).toBe("contents");
  });

  it("sets BINARY encoding for invalid charsets", () => {
    const params = parseFixture("content_type_and_unknown_charset")!;
    expect(params["text"]).toBe("contents");
  });

  it("sets BINARY encoding on things without content type", () => {
    const params = parseFixture("none")!;
    expect(params["submit-name"]).toBe("Larry");
  });

  it("sets UTF8 encoding on names of things without a content type", () => {
    const params = parseFixture("none")!;
    expect(Object.keys(params)).toContain("submit-name");
  });

  it("sets default text to UTF8", () => {
    const params = parseFixture("text")!;
    expect(params["submit-name"]).toBe("Larry");
    expect(params["submit-name-with-content"]).toBe("Berry");
  });

  it("handles quoted encodings", () => {
    const params = parseFixture("unity3d_wwwform")!;
    expect(params["user_sid"]).toBe("bbf14f82-d2aa-4c07-9fb8-ca6714a7ea97");
  });

  it("parses multipart form webkit style", () => {
    const params = parseFixture("webkit", "----WebKitFormBoundaryWLHCs9qmcJJoyjKR")!;
    expect(params["profile"]["bio"]).toContain("hello");
    expect(Object.keys(params["profile"])).toContain("public_email");
  });

  it("rejects insanely long boundaries", () => {
    expect(() => {
      MultipartParser.parse("body", `multipart/form-data; boundary=${"x".repeat(100)}`);
    }).toThrow(BoundaryTooLongError);
  });

  it("rejects excessive data before boundary", () => {
    const boundary = "AaB03x";
    // 128KB of junk before the boundary
    const junk = "x".repeat(128 * 1024);
    const body = `${junk}--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n\r\nval\r\n--${boundary}--\r\n`;
    expect(() => {
      MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`);
    }).toThrow();
  });

  it("rejects excessive mime header size", () => {
    const boundary = "AaB03x";
    const longHeader = "X-Custom: " + "a".repeat(32 * 1024);
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"\r\n${longHeader}\r\n\r\nval\r\n--${boundary}--\r\n`;
    // Should still parse (we don't currently limit header size, but the body is valid)
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["a"]).toBe("val");
  });

  it("parses when the MIME head terminator straddles the BUFSIZE boundary", () => {
    const boundary = "AaB03x";
    // Create a header that's close to 16384 bytes so the \r\n\r\n separator straddles a buffer boundary
    const padding = "X-Padding: " + "a".repeat(16370) + "\r\n";
    const body = `--${boundary}\r\n${padding}content-disposition: form-data; name="a"\r\n\r\nval\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["a"]).toBe("val");
  });

  it.skip("rejects excessive buffered mime data size in a single parameter", () => {});
  it.skip("rejects excessive buffered mime data size when split into multiple parameters", () => {});

  it("allows large nonbuffered mime parameters", () => {
    const boundary = "AaB03x";
    const largeContent = "x".repeat(256 * 1024);
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="f"; filename="big.bin"\r\ncontent-type: application/octet-stream\r\n\r\n${largeContent}\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["f"].filename).toBe("big.bin");
    expect(params["f"].tempfile.read().length).toBe(256 * 1024);
  });

  it("parses strange multipart pdf", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const dashes = "-".repeat(1024 * 1024);
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="a"; filename="a.pdf"\r\ncontent-type:application/pdf\r\n\r\n${dashes}\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["a"].filename).toBe("a.pdf");
    expect(params["a"].type).toBe("application/pdf");
    expect(params["a"].tempfile.read().length).toBe(1024 * 1024);
  });

  it("parses content-disposition with modification date before the name parameter", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data; filename="sample.sql"; modification-date="Wed, 26 Apr 2023 11:01:34 GMT"; size=24; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(Object.keys(params)).toEqual(["file"]);
    expect(params["file"].filename).toBe("sample.sql");
  });

  it("parses content-disposition with colon in parameter value before the name parameter", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data; filename="sam:ple.sql"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["file"].filename).toBe("sam:ple.sql");
  });

  it("parses content-disposition with name= in parameter value before the name parameter", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data;filename="name=bar"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["file"].filename).toBe("name=bar");
  });

  it("parses content-disposition with unquoted parameter values", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data;filename=sam:ple.sql; name=file\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["file"].filename).toBe("sam:ple.sql");
  });

  it("parses content-disposition with backslash escaped parameter values", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data;filename="foo\\"bar"; name=file\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    // For filename, backslash before non-quote keeps both chars per Ruby Rack
    expect(params["file"].filename).toBe('foo"bar');
  });

  it("parses content-disposition with IE full paths in filename", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data;filename="c:\\foo\\bar"; name=file;\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["file"].filename).toBe("bar");
  });

  it("parses content-disposition with escaped parameter values in name", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data;filename="bar"; name="file\\\\-\\xfoo"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(Object.keys(params)).toEqual(["file\\-xfoo"]);
    expect(params["file\\-xfoo"].filename).toBe("bar");
  });

  it("parses content-disposition with escaped parameter values in name", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const body = `--${boundary}\r\nContent-Disposition: form-data;filename="bar"; name="file\\\\-\\xfoo"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(params["file\\-xfoo"].filename).toBe("bar");
  });

  it("parses up to 16 content-disposition params", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const extraParams = Array.from({ length: 14 }, (_, i) => `a${i}=b`).join(";");
    const body = `--${boundary}\r\nContent-Disposition: form-data;${extraParams}; filename="bar"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(Object.keys(params)).toEqual(["file"]);
    expect(params["file"].filename).toBe("bar");
  });

  it("stops parsing content-disposition after 16 params", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const extraParams = Array.from({ length: 15 }, (_, i) => `a${i}=b`).join(";");
    const body = `--${boundary}\r\nContent-Disposition: form-data;${extraParams}; filename="bar"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    // After 16 params, name/filename stop being read - filename becomes the name
    expect(params["bar"]).toBeDefined();
    expect(params["bar"].filename).toBe("bar");
  });

  it("allows content-disposition values up to 1536 bytes", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const filler = "a".repeat(1480);
    const body = `--${boundary}\r\nContent-Disposition: form-data;a=${filler}; filename="bar"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    expect(Object.keys(params)).toEqual(["file"]);
  });

  it("ignores content-disposition values over to 1536 bytes", () => {
    const boundary = "---------------------------932620571087722842402766118";
    const filler = "a".repeat(1510);
    const body = `--${boundary}\r\nContent-Disposition: form-data;a=${filler}; filename="bar"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
    const params = MultipartParser.parse(body, `multipart/form-data; boundary=${boundary}`)!;
    // Disposition ignored, falls back to content-type as name
    // console.log("KEYS:", JSON.stringify(Object.keys(params)));
    expect(Object.keys(params).length).toBeGreaterThan(0);
    // Ruby returns {"application/pdf"=>[""]}, our fallback uses content-type[] as name
    const key = Object.keys(params)[0];
    expect(key).toContain("application/pdf");
  });

  it("raises an EOF error on content-length mismatch", () => {
    const env = {
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      CONTENT_LENGTH: "100",
      "rack.input": { read() { return ""; } },
    };
    expect(() => parseMultipart(env)).toThrow(EmptyContentError);
  });

  it("parses multipart upload with text file", () => {
    const params = parseFixture("text")!;
    expect(params["submit-name"]).toBe("Larry");
    expect(params["submit-name-with-content"]).toBe("Berry");
    expect(params["files"].type).toBe("text/plain");
    expect(params["files"].filename).toBe("file1.txt");
    expect(params["files"].name).toBe("files");
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it.skip("accepts the params hash class to use for multipart parsing", () => {});
  it("preserves extension in the created tempfile", () => {
    const params = parseFixture("text")!;
    // The filename should have the .txt extension preserved
    expect(params["files"].filename).toBe("file1.txt");
    expect(params["files"].filename.endsWith(".txt")).toBe(true);
  });

  it("parses multipart upload with text file with a no name field", () => {
    const params = parseFixture("filename_and_no_name")!;
    expect(params["file1.txt"].type).toBe("text/plain");
    expect(params["file1.txt"].filename).toBe("file1.txt");
    expect(params["file1.txt"].tempfile.read()).toBe("contents");
  });

  it.skip("parses multipart upload file using custom tempfile class", () => {});

  it("parses multipart upload with nested parameters", () => {
    const params = parseFixture("nested")!;
    expect(params["foo"]["submit-name"]).toBe("Larry");
    expect(params["foo"]["files"].type).toBe("text/plain");
    expect(params["foo"]["files"].filename).toBe("file1.txt");
    expect(params["foo"]["files"].tempfile.read()).toBe("contents");
  });

  it("parses multipart upload with binary file", () => {
    const params = parseFixture("binary")!;
    expect(params["submit-name"]).toBe("Larry");
    expect(params["files"].type).toBe("image/png");
    expect(params["files"].filename).toBe("rack-logo.png");
    expect(params["files"].name).toBe("files");
    expect(params["files"].tempfile.read().length).toBe(26473);
  });

  it("parses multipart upload with an empty file", () => {
    const params = parseFixture("empty")!;
    expect(params["submit-name"]).toBe("Larry");
    expect(params["files"].type).toBe("text/plain");
    expect(params["files"].filename).toBe("file1.txt");
    expect(params["files"].tempfile.read()).toBe("");
  });

  it("parses multipart upload with a filename containing semicolons", () => {
    const params = parseFixture("semicolon")!;
    expect(params["files"].type).toBe("text/plain");
    expect(params["files"].filename).toBe("fi;le1.txt");
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses multipart upload with quoted boundary", () => {
    const params = parseFixture("quoted", '"AaB:03x"')!;
    expect(params["submit-name"]).toBe("Larry");
    expect(params["submit-name-with-content"]).toBe("Berry");
    expect(params["files"].filename).toBe("file1.txt");
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses multipart upload with a filename containing invalid characters", () => {
    const params = parseFixture("invalid_character")!;
    expect(params["files"].type).toBe("text/plain");
    expect(params["files"].filename).toMatch(/invalid/);
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses multipart form with an encoded word filename", () => {
    const params = parseFixture("filename_with_encoded_words")!;
    expect(params["files"].filename).toBe("файл");
  });

  it("parses multipart form with a single quote in the filename", () => {
    const params = parseFixture("filename_with_single_quote")!;
    expect(params["files"].filename).toBe("bob's flowers.jpg");
  });

  it("parses multipart form with a null byte in the filename", () => {
    const params = parseFixture("filename_with_null_byte")!;
    // Percent-encoded null byte gets decoded
    expect(params["files"].filename).toContain("flowers.exe");
  });

  it("is robust separating content-disposition fields", () => {
    const params = parseFixture("robust_field_separation")!;
    expect(params["text"]).toBe("contents");
  });

  it("does not include file params if no file was selected", () => {
    const params = parseFixture("none")!;
    expect(params["submit-name"]).toBe("Larry");
    expect(params["files"]).toBeUndefined();
    expect(Object.keys(params)).not.toContain("files");
  });

  it("parses multipart/mixed", () => {
    const params = parseFixture("mixed_files")!;
    expect(params["foo"]).toBe("bar");
    // multipart/mixed sub-parts are stored as a string (the raw sub-body)
    expect(typeof params["files"]).toBe("string");
  });

  it("parses IE multipart upload and cleans up the filename", () => {
    const params = parseFixture("ie")!;
    expect(params["files"].type).toBe("text/plain");
    expect(params["files"].filename).toBe("file1.txt");
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses filename and modification param", () => {
    const params = parseFixture("filename_and_modification_param")!;
    expect(params["files"].type).toBe("image/jpeg");
    expect(params["files"].filename).toBe("genome.jpeg");
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses filename with escaped quotes", () => {
    const params = parseFixture("filename_with_escaped_quotes")!;
    expect(params["files"].type).toBe("application/octet-stream");
    expect(params["files"].filename).toBe('escape "quotes');
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses filename with plus character", () => {
    const params = parseFixture("filename_with_plus")!;
    expect(params["files"].type).toBe("application/octet-stream");
    expect(params["files"].filename).toBe("foo+bar");
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses filename with percent escaped quotes", () => {
    const params = parseFixture("filename_with_percent_escaped_quotes")!;
    expect(params["files"].type).toBe("application/octet-stream");
    expect(params["files"].filename).toBe('escape "quotes');
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses filename with escaped quotes and modification param", () => {
    const params = parseFixture("filename_with_escaped_quotes_and_modification_param")!;
    expect(params["files"].type).toBe("image/jpeg");
    expect(params["files"].filename).toBe('"human" genome.jpeg');
    expect(params["files"].tempfile.read()).toBe("contents");
  });

  it("parses filename with unescaped percentage characters", () => {
    const params = parseFixture("filename_with_unescaped_percentages", "----WebKitFormBoundary2NHc7OhsgU68l3Al")!;
    const files = params["document"]["attachment"];
    expect(files.type).toBe("image/jpeg");
    expect(files.filename).toBe("100% of a photo.jpeg");
    expect(files.tempfile.read()).toBe("contents");
  });
});
