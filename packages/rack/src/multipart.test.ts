import { it, expect } from "vitest";
import { EOFError } from "@blazetrails/ruby-compat";
import {
  MultipartPartLimitError,
  MultipartTotalPartLimitError,
  BoundaryTooLongError,
  EmptyContentError,
  MissingInputError,
  parseMultipart,
  buildMultipart,
  UploadedFile,
} from "./multipart.js";
import {
  multipartFileLimit,
  setMultipartFileLimit,
  multipartTotalPartLimit,
  setMultipartTotalPartLimit,
} from "./utils.js";
import { ArgumentError, Errno, StringIO } from "@blazetrails/ruby-compat";
import { MockRequest } from "./mock-request.js";
import { Params, QueryParser } from "./query-parser.js";
import { Request } from "./request.js";
import * as fs from "fs";
import * as path from "path";

const fixtureDir = path.join(__dirname, "..", "test", "multipart");

function multipartFixture(name: string, boundary = "AaB03x"): Record<string, any> {
  const file = multipartFile(name);
  const data = fs.readFileSync(file, "binary");

  const type = `multipart/form-data; boundary=${boundary}`;
  const length = data.length;

  return { CONTENT_TYPE: type, CONTENT_LENGTH: String(length), ":input": new StringIO(data) };
}

const contentDispositionParse = (params: string): Record<string, any> => {
  const boundary = "---------------------------932620571087722842402766118";

  const data = new StringIO();
  data.write(`--${boundary}`);
  data.write("\r\n");
  data.write(`Content-Disposition: form-data;${params}`);
  data.write("\r\n");
  data.write("content-type:application/pdf\r\n");
  data.write("\r\n");
  data.write(`--${boundary}--\r\n`);
  data.rewind();

  const fixture = {
    CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
    CONTENT_LENGTH: String(data.size()),
    ":input": data,
  };

  const env = MockRequest.envFor("/", fixture);
  return parseMultipart(env)!;
};

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

it("parses filename with unescaped percentage characters that look like partial hex escapes", () => {
  const env = MockRequest.envFor(
    "/",
    multipartFixture(
      "filename_with_unescaped_percentages2",
      "----WebKitFormBoundary2NHc7OhsgU68l3Al",
    ),
  );
  const params = parseMultipart(env)!;
  const files = params["document"]["attachment"];
  expect(files.type).toBe("image/jpeg");
  expect(files.filename).toBe("100%a");
  expect(files.head).toBe(
    'content-disposition: form-data; name="document[attachment]"; filename="100%a"\r\ncontent-type: image/jpeg\r\n',
  );

  expect(files.name).toBe("document[attachment]");
  expect(files.tempfile.read()).toBe("contents");
});

it("parses filename with unescaped percentage characters that look like partial hex escapes", () => {
  const env = MockRequest.envFor(
    "/",
    multipartFixture(
      "filename_with_unescaped_percentages3",
      "----WebKitFormBoundary2NHc7OhsgU68l3Al",
    ),
  );
  const params = parseMultipart(env)!;
  const files = params["document"]["attachment"];
  expect(files.type).toBe("image/jpeg");
  expect(files.filename).toBe("100%");
  expect(files.head).toBe(
    'content-disposition: form-data; name="document[attachment]"; filename="100%"\r\ncontent-type: image/jpeg\r\n',
  );

  expect(files.name).toBe("document[attachment]");
  expect(files.tempfile.read()).toBe("contents");
});

it("raises a RuntimeError for invalid file path", () => {
  expect(() => new UploadedFile("non-existant")).toThrow();
});

it("supports uploading files in binary mode", () => {
  expect(new UploadedFile(multipartFile("file1.txt")).isBinmode()).toBeFalsy();
  expect(new UploadedFile(multipartFile("file1.txt"), { binary: true }).isBinmode()).toBeTruthy();
});

function multipartFile(name: string): string {
  return path.join(fixtureDir, name);
}

function buildFixture(data: string): Record<string, any> {
  return envFor(data, "multipart/form-data; boundary=AaB03x");
}

it("builds multipart body", () => {
  const files = new UploadedFile(multipartFile("file1.txt"));
  const data = buildMultipart({ "submit-name": "Larry", files }) as string;

  const env = buildFixture(data);
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["files"].filename).toBe("file1.txt");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("builds multipart filename with space", () => {
  const files = new UploadedFile(multipartFile("space case.txt"));
  const data = buildMultipart({ "submit-name": "Larry", files }) as string;

  const env = buildFixture(data);
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["files"].filename).toBe("space case.txt");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("builds nested multipart body using array", () => {
  const files = new UploadedFile(multipartFile("file1.txt"));
  const data = buildMultipart({ people: [{ "submit-name": "Larry", files }] }) as string;

  const env = buildFixture(data);
  const params = parseMultipart(env)!;
  expect(params["people"][0]["submit-name"]).toBe("Larry");
  expect(params["people"][0]["files"].filename).toBe("file1.txt");
  expect(params["people"][0]["files"].tempfile.read()).toBe("contents");
});

it("builds nested multipart body using hash", () => {
  const files = new UploadedFile(multipartFile("file1.txt"));
  const data = buildMultipart({ people: { foo: { "submit-name": "Larry", files } } }) as string;

  const env = buildFixture(data);
  const params = parseMultipart(env)!;
  expect(params["people"]["foo"]["submit-name"]).toBe("Larry");
  expect(params["people"]["foo"]["files"].filename).toBe("file1.txt");
  expect(params["people"]["foo"]["files"].tempfile.read()).toBe("contents");
});

it("builds multipart body from StringIO", () => {
  const files = new UploadedFile({ io: new StringIO("foo"), filename: "bar.txt" });
  const data = buildMultipart({ "submit-name": "Larry", files }) as string;

  const env = buildFixture(data);
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["files"].filename).toBe("bar.txt");
  expect(params["files"].tempfile.read()).toBe("foo");
});

it("can parse fields that end at the end of the buffer", () => {
  const input = fs.readFileSync(multipartFile("bad_robots"), "binary");

  const req = new Request(
    MockRequest.envFor("/", {
      CONTENT_TYPE: "multipart/form-data, boundary=1yy3laWhgX31qpiHinh67wJXqKalukEUTvqTzmon",
      CONTENT_LENGTH: input.length,
      ":input": input,
    }),
  );

  expect(req.POST["file.path"]).toBe("/var/tmp/uploads/4/0001728414");
  expect(req.POST["addresses"]).not.toEqual(null);
});

it("builds complete params with the chunk size of 16384 slicing exactly on boundary", () => {
  const previousLimit = multipartFileLimit();
  try {
    setMultipartFileLimit(256);

    const data = fs
      .readFileSync(multipartFile("fail_16384_nofile"), "binary")
      .replace(/\n/g, "\r\n");
    const options = {
      CONTENT_TYPE: "multipart/form-data; boundary=----WebKitFormBoundaryWsY0GnpbI5U7ztzo",
      CONTENT_LENGTH: String(data.length),
      ":input": new StringIO(data),
    };
    const env = MockRequest.envFor("/", options);
    const params = parseMultipart(env)!;

    expect(params).not.toEqual(null);
    expect(Object.keys(params)).toContain("AAAAAAAAAAAAAAAAAAA");
    expect(Object.keys(params["AAAAAAAAAAAAAAAAAAA"])).toContain("PLAPLAPLA_MEMMEMMEMM_ATTRATTRER");
    expect(Object.keys(params["AAAAAAAAAAAAAAAAAAA"]["PLAPLAPLA_MEMMEMMEMM_ATTRATTRER"])).toContain(
      "new",
    );
    expect(
      Object.keys(params["AAAAAAAAAAAAAAAAAAA"]["PLAPLAPLA_MEMMEMMEMM_ATTRATTRER"]["new"]),
    ).toContain("-2");
    expect(
      Object.keys(params["AAAAAAAAAAAAAAAAAAA"]["PLAPLAPLA_MEMMEMMEMM_ATTRATTRER"]["new"]["-2"]),
    ).toContain("ba_unit_id");
    expect(
      params["AAAAAAAAAAAAAAAAAAA"]["PLAPLAPLA_MEMMEMMEMM_ATTRATTRER"]["new"]["-2"]["ba_unit_id"],
    ).toBe("1017");
  } finally {
    setMultipartFileLimit(previousLimit);
  }
});

it("does not reach a multi-part limit", () => {
  const previousLimit = multipartFileLimit();
  setMultipartFileLimit(4);
  try {
    const env = MockRequest.envFor("/", multipartFixture("three_files_three_fields"));
    const params = parseMultipart(env)!;
    expect(params["reply"]).toBe("yes");
    expect(params["to"]).toBe("people");
    expect(params["from"]).toBe("others");
  } finally {
    setMultipartFileLimit(previousLimit);
  }
});

it("treats a multipart limit of 0 as no limit", () => {
  const previousLimit = multipartFileLimit();
  setMultipartFileLimit(0);
  try {
    const env = MockRequest.envFor("/", multipartFixture("three_files_three_fields"));
    const params = parseMultipart(env)!;
    expect(params["reply"]).toBe("yes");
    expect(params["to"]).toBe("people");
    expect(params["from"]).toBe("others");
  } finally {
    setMultipartFileLimit(previousLimit);
  }
});

it("reaches a multipart file limit", () => {
  const previousLimit = multipartFileLimit();
  setMultipartFileLimit(3);
  try {
    const env = MockRequest.envFor("/", multipartFixture("three_files_three_fields"));
    expect(() => parseMultipart(env)).toThrow(MultipartPartLimitError);
  } finally {
    setMultipartFileLimit(previousLimit);
  }
});

it("reaches a multipart total limit", () => {
  const previousLimit = multipartTotalPartLimit();
  setMultipartTotalPartLimit(5);
  try {
    const env = MockRequest.envFor("/", multipartFixture("three_files_three_fields"));
    expect(() => parseMultipart(env)).toThrow(MultipartTotalPartLimitError);
  } finally {
    setMultipartTotalPartLimit(previousLimit);
  }
});

it("returns nil if no UploadedFiles were used", () => {
  const data = buildMultipart({ people: [{ "submit-name": "Larry", files: "contents" }] });
  expect(data).toBeNull();
});

it("raises ArgumentError if params is not a Hash", () => {
  let error: Error | undefined;
  expect(() => {
    try {
      buildMultipart("foo=bar");
    } catch (e) {
      error = e as Error;
      throw e;
    }
  }).toThrow(ArgumentError);
  expect(error!.message).toBe("value must be a Hash");
});

it("is able to parse fields with a content type", () => {
  const params = parseFixture("content_type_and_no_filename")!;
  expect(params["text"]).toBe("contents");
});

it("parses multipart upload with no content-length header", () => {
  const env = MockRequest.envFor("/", multipartFixture("webkit"));
  env["CONTENT_TYPE"] = "multipart/form-data; boundary=----WebKitFormBoundaryWLHCs9qmcJJoyjKR";
  delete env["CONTENT_LENGTH"];
  const params = parseMultipart(env)!;
  expect(params["profile"]["bio"]).toContain("hello");
});

it("does not remove escaped quotes in filenames", () => {
  const data = `--AaB03x\r
content-type: text/plain\r
content-disposition: attachment; name=file; filename="\\"${"long".repeat(100)}\\""\r
\r
contents\r
--AaB03x--\r
`;

  const options = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    CONTENT_LENGTH: String(data.length),
    ":input": new StringIO(data),
  };
  const env = MockRequest.envFor("/", options);
  const params = parseMultipart(env)!;

  expect(params["file"].filename).toBe(`"${"long".repeat(100)}"`);
});

it("limits very long file name extensions in multipart tempfiles", () => {
  const data = `--AaB03x\r
content-type: text/plain\r
content-disposition: attachment; name=file; filename=foo.${"a".repeat(1000)}\r
\r
contents\r
--AaB03x--\r
`;

  const options = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    CONTENT_LENGTH: String(data.length),
    ":input": new StringIO(data),
  };
  const env = MockRequest.envFor("/", options);
  const params = parseMultipart(env)!;

  expect(params["file"].filename).toBe(`foo.${"a".repeat(1000)}`);
  expect(path.extname(env["rack.tempfiles"][0].path())).toBe(`.${"a".repeat(128)}`);
});

it("parses unquoted parameter values at end of line", () => {
  const data = `--AaB03x\r
content-type: text/plain\r
content-disposition: attachment; name=inline\r
\r
true\r
--AaB03x--\r
`;

  const options = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    CONTENT_LENGTH: String(data.length),
    ":input": new StringIO(data),
  };
  const env = MockRequest.envFor("/", options);
  const params = parseMultipart(env)!;
  expect(params["inline"]).toBe("true");
});

it("parses quoted chars in name parameter", () => {
  const data = `--AaB03x\r
content-type: text/plain\r
content-disposition: attachment; name="quoted\\\\chars\\"in\rname"\r
\r
true\r
--AaB03x--\r
`;

  const options = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    CONTENT_LENGTH: String(data.length),
    ":input": new StringIO(data),
  };
  const env = MockRequest.envFor("/", options);
  const params = parseMultipart(env)!;
  expect(params['quoted\\chars"in\rname']).toBe("true");
});

it("supports mixed case metadata", () => {
  const params = parseFixture("text", "AaB03x")!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["submit-name-with-content"]).toBe("Berry");
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toBe("file1.txt");
  expect(params["files"].head).toBe(
    'content-disposition: form-data; name="files"; filename="file1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("falls back to content-type for the name", () => {
  const rackLogo = fs.readFileSync(multipartFile("rack-logo.png"), "binary");

  const data = `--AaB03x\r
content-type: text/plain\r
\r
some text\r
--AaB03x\r
\r
\r
some more text (I didn't specify content-type)\r
--AaB03x\r
content-type: image/png\r
\r
${rackLogo}\r
--AaB03x--\r
`;

  const options = {
    CONTENT_TYPE: "multipart/related; boundary=AaB03x",
    CONTENT_LENGTH: String(data.length),
    ":input": new StringIO(data),
  };
  const env = MockRequest.envFor("/", options);
  const params = parseMultipart(env)!;

  expect(params["text/plain"]).toEqual([
    "some text",
    "some more text (I didn't specify content-type)",
  ]);
  expect(params["image/png"].length).toBe(1);
});

it("returns nil if the content type is not multipart", () => {
  const env = {
    CONTENT_TYPE: "application/x-www-form-urlencoded",
    "rack.input": {
      read() {
        return "";
      },
    },
  };
  expect(parseMultipart(env)).toBeNull();
});

it("raises an exception if boundary is too long", () => {
  expect(() => parseFixture("content_type_and_no_filename", "A".repeat(71))).toThrow(
    BoundaryTooLongError,
  );
});

it("raises a bad request exception if no body is given but content type indicates a multipart body", () => {
  const env = {
    CONTENT_TYPE: "multipart/form-data; boundary=BurgerBurger",
    "rack.input": null,
  };
  expect(() => parseMultipart(env)).toThrow(MissingInputError);
});

it("parses multipart content when content type is present but disposition is not", () => {
  const env = MockRequest.envFor("/", multipartFixture("content_type_and_no_disposition"));
  const params = parseMultipart(env)!;
  expect(params["text/plain; charset=US-ASCII"]).toEqual(["contents"]);
});

it("parses multipart content when content type is present but disposition is not when using IO", () => {
  const env = MockRequest.envFor("/", multipartFixture("content_type_and_no_disposition"));
  const params = parseMultipart(env)!;
  expect(params["text/plain; charset=US-ASCII"]).toEqual(["contents"]);
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

it("parses multipart content with different filename and filename*", () => {
  const params = parseFixture("filename_multi")!;
  expect(params["files"].filename).toBe("bar");
});

// PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — every assertion is a `.encoding`.
it.skip("sets US_ASCII encoding based on charset", () => {
  const env = MockRequest.envFor("/", multipartFixture("content_type_and_no_filename"));
  parseMultipart(env);
});

// PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — every assertion is a `.encoding`.
it.skip("sets BINARY encoding for invalid charsets", () => {
  const env = MockRequest.envFor("/", multipartFixture("content_type_and_unknown_charset"));
  parseMultipart(env);
});

it("sets BINARY encoding on things without content type", () => {
  const params = parseFixture("none")!;
  expect(params["submit-name"]).toBe("Larry");
});

// PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — every assertion is a `.encoding`.
it.skip("sets UTF8 encoding on names of things without a content type", () => {
  const env = MockRequest.envFor("/", multipartFixture("none"));
  parseMultipart(env);
});

// PERMANENT-SKIP: CLAUDE.md "A String has no encoding tag either" — every assertion is a `.encoding`.
it.skip("sets default text to UTF8", () => {
  const env = MockRequest.envFor("/", multipartFixture("text"));
  parseMultipart(env);
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
  let rdClosed = false;
  const thr = (function* (): Generator<string, unknown, void> {
    try {
      yield "--AaB03x";

      const longer = "0123456789".repeat(1024 * 1024);
      for (let i = 0; i < 1024 * 1024; i++) {
        if (rdClosed) throw new Errno.EPIPE();
        yield longer;
      }

      yield "\r\n";
      yield 'content-disposition: form-data; name="a"; filename="a.txt"';
      yield "\r\n";
      yield "content-type: text/plain\r\n";
      yield "\r\na";
      yield "--AaB03x--\r\n";
    } catch (err) {
      return err;
    }
  })();
  let pending = "";
  const rd = {
    read(size: number): string | null {
      while (pending.length < size) {
        const chunk = thr.next();
        if (chunk.done) break;
        pending += chunk.value;
      }
      if (pending.length === 0) return null;
      const out = pending.slice(0, size);
      pending = pending.slice(size);
      return out;
    },
    rewind(): void {},
    close(): void {
      rdClosed = true;
    },
  };

  const fixture = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    CONTENT_LENGTH: String(1024 * 1024 * 8),
    ":input": rd,
  };

  const env = MockRequest.envFor("/", fixture);
  expect(() => {
    parseMultipart(env);
  }).toThrow(EmptyContentError);
  rd.close();

  const err = thr.next().value;
  expect(err).toBeInstanceOf(Errno.EPIPE);
});

it("parses strange multipart pdf", () => {
  const boundary = "---------------------------932620571087722842402766118";

  const data = new StringIO();
  data.write(`--${boundary}`);
  data.write("\r\n");
  data.write('content-disposition: form-data; name="a"; filename="a.pdf"');
  data.write("\r\n");
  data.write("content-type:application/pdf\r\n");
  data.write("\r\n");
  data.write("-".repeat(1024 * 1024));
  data.write("\r\n");
  data.write(`--${boundary}--\r\n`);
  data.rewind();

  const fixture = {
    CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
    CONTENT_LENGTH: String(data.size()),
    ":input": data,
  };

  const env = MockRequest.envFor("/", fixture);
  parseMultipart(env);
});

it("parses content-disposition with modification date before the name parameter", () => {
  const x = contentDispositionParse(
    ' filename="sample.sql"; modification-date="Wed, 26 Apr 2023 11:01:34 GMT"; size=24; name="file"',
  );
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("sample.sql");
  expect(x["file"].name).toBe("file");
});

it("parses content-disposition with colon in parameter value before the name parameter", () => {
  const x = contentDispositionParse(' filename="sam:ple.sql"; name="file"');
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("sam:ple.sql");
  expect(x["file"].name).toBe("file");
});

it("parses content-disposition with name= in parameter value before the name parameter", () => {
  const x = contentDispositionParse('filename="name=bar"; name="file"');
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("name=bar");
  expect(x["file"].name).toBe("file");
});

it("parses content-disposition with unquoted parameter values", () => {
  const x = contentDispositionParse("filename=sam:ple.sql; name=file");
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("sam:ple.sql");
  expect(x["file"].name).toBe("file");
});

it("parses content-disposition with backslash escaped parameter values", () => {
  const x = contentDispositionParse('filename="foo\\"bar"; name=file');
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe('foo"bar');
  expect(x["file"].name).toBe("file");
});

it("parses content-disposition with IE full paths in filename", () => {
  const x = contentDispositionParse('filename="c:\\foo\\bar"; name=file;');
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("bar");
  expect(x["file"].name).toBe("file");
});

it("parses content-disposition with escaped parameter values in name", () => {
  const x = contentDispositionParse('filename="bar"; name="file\\\\-\\xfoo"');
  expect(Object.keys(x)).toEqual(["file\\-xfoo"]);
  expect(x["file\\-xfoo"].filename).toBe("bar");
  expect(x["file\\-xfoo"].name).toBe("file\\-xfoo");
});

it("parses content-disposition with escaped parameter values in name", () => {
  const x = contentDispositionParse('filename="bar"; name="file\\\\-\\xfoo"');
  expect(Object.keys(x)).toEqual(["file\\-xfoo"]);
  expect(x["file\\-xfoo"].filename).toBe("bar");
  expect(x["file\\-xfoo"].name).toBe("file\\-xfoo");
});

it("parses up to 16 content-disposition params", () => {
  const x = contentDispositionParse(
    `${Array.from({ length: 14 }, (_, x) => `a${x}=b;`).join("")} filename="bar"; name="file"`,
  );
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("bar");
  expect(x["file"].name).toBe("file");
});

it("stops parsing content-disposition after 16 params", () => {
  const x = contentDispositionParse(
    `${Array.from({ length: 15 }, (_, x) => `a${x}=b;`).join("")} filename="bar"; name="file"`,
  );
  expect(Object.keys(x)).toEqual(["bar"]);
  expect(x["bar"].filename).toBe("bar");
  expect(x["bar"].name).toBe("bar");
});

it("allows content-disposition values up to 1536 bytes", () => {
  const x = contentDispositionParse(`a=${"a".repeat(1480)}; filename="bar"; name="file"`);
  expect(Object.keys(x)).toEqual(["file"]);
  expect(x["file"].filename).toBe("bar");
  expect(x["file"].name).toBe("file");
});

it("ignores content-disposition values over to 1536 bytes", () => {
  const boundary = "---------------------------932620571087722842402766118";
  const filler = "a".repeat(1510);
  const body = `--${boundary}\r\nContent-Disposition: form-data;a=${filler}; filename="bar"; name="file"\r\ncontent-type:application/pdf\r\n\r\n\r\n--${boundary}--\r\n`;
  const params = parseMultipart(envFor(body, `multipart/form-data; boundary=${boundary}`))!;
  expect(params).toEqual({ "text/plain": [""] });
});

it("raises an EOF error on content-length mismatch", () => {
  const env = {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    CONTENT_LENGTH: "100",
    "rack.input": {
      read() {
        return "";
      },
    },
  };
  expect(() => parseMultipart(env)).toThrow(EOFError);
});

it("parses multipart upload with text file", () => {
  const env = MockRequest.envFor("/", multipartFixture("text"));
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["submit-name-with-content"]).toBe("Berry");
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toBe("file1.txt");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; filename="file1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("accepts the params hash class to use for multipart parsing", () => {
  const queryParser = new QueryParser(Params, 100);
  const env = MockRequest.envFor("/", multipartFixture("text"));
  const params = parseMultipart(env, queryParser)!;
  expect(params["files"].type).toBe("text/plain");
});
it("preserves extension in the created tempfile", () => {
  const env = MockRequest.envFor("/", multipartFixture("text"));
  const params = parseMultipart(env)!;
  expect(path.extname(params["files"].tempfile.path())).toBe(".txt");
});

it("parses multipart upload with text file with a no name field", () => {
  const env = MockRequest.envFor("/", multipartFixture("filename_and_no_name"));
  const params = parseMultipart(env)!;
  expect(params["file1.txt"].type).toBe("text/plain");
  expect(params["file1.txt"].filename).toBe("file1.txt");
  expect(params["file1.txt"].head).toBe(
    "content-disposition: form-data; " +
      'filename="file1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["file1.txt"].name).toBe("file1.txt");
  expect(params["file1.txt"].tempfile.read()).toBe("contents");
});

it("parses multipart upload file using custom tempfile class", () => {
  const env = MockRequest.envFor("/", multipartFixture("text"));
  let writtenContent = "";
  const myTempfile = {
    write(data: Uint8Array) {
      writtenContent += String.fromCharCode(...data);
    },
    read() {
      return writtenContent;
    },
    rewind() {},
  };
  env["rack.multipart.tempfile_factory"] = (_filename: string, _contentType: string) => myTempfile;
  const params = parseMultipart(env)!;
  expect(params["files"].tempfile).toBe(myTempfile);
  expect(writtenContent).toBe("contents");
});

it("parses multipart upload with nested parameters", () => {
  const env = MockRequest.envFor("/", multipartFixture("nested"));
  const params = parseMultipart(env)!;
  expect(params["foo"]["submit-name"]).toBe("Larry");
  expect(params["foo"]["files"].type).toBe("text/plain");
  expect(params["foo"]["files"].filename).toBe("file1.txt");
  expect(params["foo"]["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="foo[files]"; filename="file1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["foo"]["files"].name).toBe("foo[files]");
  expect(params["foo"]["files"].tempfile.read()).toBe("contents");
});

it("parses multipart upload with binary file", () => {
  const env = MockRequest.envFor("/", multipartFixture("binary"));
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");

  expect(params["files"].type).toBe("image/png");
  expect(params["files"].filename).toBe("rack-logo.png");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; filename="rack-logo.png"\r\n' +
      "content-type: image/png\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read().length).toBe(26473);
});

it("parses multipart upload with an empty file", () => {
  const env = MockRequest.envFor("/", multipartFixture("empty"));
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toBe("file1.txt");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; filename="file1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("");
});

it("parses multipart upload with a filename containing semicolons", () => {
  const env = MockRequest.envFor("/", multipartFixture("semicolon"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toBe("fi;le1.txt");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; filename="fi;le1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses multipart upload with quoted boundary", () => {
  const env = MockRequest.envFor("/", multipartFixture("quoted", '"AaB:03x"'));
  const params = parseMultipart(env)!;
  expect(params["submit-name"]).toBe("Larry");
  expect(params["submit-name-with-content"]).toBe("Berry");
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toBe("file1.txt");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; filename="file1.txt"\r\n' +
      "content-type: text/plain\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses multipart upload with a filename containing invalid characters", () => {
  const env = MockRequest.envFor("/", multipartFixture("invalid_character"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toMatch(/invalid/);
  const head =
    "content-disposition: form-data; " +
    'name="files"; filename="invalid\xC3.txt"\r\n' +
    "content-type: text/plain\r\n";
  expect(params["files"].head).toBe(head);
  expect(params["files"].name).toBe("files");
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
  const env = MockRequest.envFor("/", multipartFixture("filename_with_null_byte"));
  const params = parseMultipart(env)!;
  expect(params["files"].filename).toBe("flowers.exe\u0000.jpg");
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
  const env = MockRequest.envFor("/", multipartFixture("mixed_files"));
  const params = parseMultipart(env)!;
  expect(params["foo"]).toBe("bar");
  expect(typeof params["files"]).toBe("string");
  expect(params["files"].length).toBe(252);
});

it("parses IE multipart upload and cleans up the filename", () => {
  const env = MockRequest.envFor("/", multipartFixture("ie"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("text/plain");
  expect(params["files"].filename).toBe("file1.txt");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; ' +
      'filename="C:\\Documents and Settings\\Administrator\\Desktop\\file1.txt"' +
      "\r\ncontent-type: text/plain\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses filename and modification param", () => {
  const env = MockRequest.envFor("/", multipartFixture("filename_and_modification_param"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("image/jpeg");
  expect(params["files"].filename).toBe("genome.jpeg");
  expect(params["files"].head).toBe(
    "content-type: image/jpeg\r\n" +
      "content-disposition: attachment; " +
      'name="files"; ' +
      "filename=genome.jpeg; " +
      'modification-date="Wed, 12 Feb 1997 16:29:51 -0500";\r\n' +
      "Content-Description: a complete map of the human genome\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses filename with escaped quotes", () => {
  const env = MockRequest.envFor("/", multipartFixture("filename_with_escaped_quotes"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("application/octet-stream");
  expect(params["files"].filename).toBe('escape "quotes');
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; ' +
      'filename="escape \\"quotes"\r\n' +
      "content-type: application/octet-stream\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses filename with plus character", () => {
  const env = MockRequest.envFor("/", multipartFixture("filename_with_plus"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("application/octet-stream");
  expect(params["files"].filename).toBe("foo+bar");
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; ' +
      'filename="foo+bar"\r\n' +
      "content-type: application/octet-stream\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses filename with percent escaped quotes", () => {
  const env = MockRequest.envFor("/", multipartFixture("filename_with_percent_escaped_quotes"));
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("application/octet-stream");
  expect(params["files"].filename).toBe('escape "quotes');
  expect(params["files"].head).toBe(
    "content-disposition: form-data; " +
      'name="files"; ' +
      'filename="escape %22quotes"\r\n' +
      "content-type: application/octet-stream\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses filename with escaped quotes and modification param", () => {
  const env = MockRequest.envFor(
    "/",
    multipartFixture("filename_with_escaped_quotes_and_modification_param"),
  );
  const params = parseMultipart(env)!;
  expect(params["files"].type).toBe("image/jpeg");
  expect(params["files"].filename).toBe('"human" genome.jpeg');
  expect(params["files"].head).toBe(
    "content-type: image/jpeg\r\n" +
      "content-disposition: attachment; " +
      'name="files"; ' +
      'filename="\\"human\\" genome.jpeg"; ' +
      'modification-date="Wed, 12 Feb 1997 16:29:51 -0500";\r\n' +
      "Content-Description: a complete map of the human genome\r\n",
  );
  expect(params["files"].name).toBe("files");
  expect(params["files"].tempfile.read()).toBe("contents");
});

it("parses filename with unescaped percentage characters", () => {
  const env = MockRequest.envFor(
    "/",
    multipartFixture(
      "filename_with_unescaped_percentages",
      "----WebKitFormBoundary2NHc7OhsgU68l3Al",
    ),
  );
  const params = parseMultipart(env)!;
  const files = params["document"]["attachment"];
  expect(files.type).toBe("image/jpeg");
  expect(files.filename).toBe("100% of a photo.jpeg");
  expect(files.head).toBe(
    'content-disposition: form-data; name="document[attachment]"; filename="100% of a photo.jpeg"\r\ncontent-type: image/jpeg\r\n',
  );

  expect(files.name).toBe("document[attachment]");
  expect(files.tempfile.read()).toBe("contents");
});
