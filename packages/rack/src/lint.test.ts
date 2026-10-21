import { it, expect } from "vitest";
import {
  Encoding,
  forceEncoding,
  rbObjRespondTo,
  StringIO,
  Tempfile,
} from "@blazetrails/ruby-compat";
import { Lint, LintError } from "./lint.js";
import { MockRequest, type RackApp } from "./mock-request.js";

const validApp: RackApp = async () => [
  200,
  { "content-type": "test/plain", "content-length": "3" },
  ["foo"],
];

function env(options: Record<string, any> = {}): Record<string, any> {
  if (!(":input" in options)) {
    options[":input"] = "";
  }

  return MockRequest.envFor("/", options);
}

it("pass valid request", async () => {
  expect((await new Lint(validApp).call(env({})))[0]).toBe(200);
});

it("notice fatal errors", async () => {
  const p = new Lint(null!).call();
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/No env given/);
});

it("notice environment errors", async () => {
  let p: Promise<any>;
  let e: Record<string, any>;

  p = new Lint(null!).call(5 as any);
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/not a Hash/);

  p = new Lint(null!).call(Object.freeze({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/env should not be frozen, but is/);

  e = env();
  delete e["REQUEST_METHOD"];
  p = new Lint(null!).call(e);
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/missing required key REQUEST_METHOD/);

  e = env();
  delete e["SERVER_NAME"];
  p = new Lint(null!).call(e);
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/missing required key SERVER_NAME/);

  e = env();
  delete e["SERVER_PROTOCOL"];
  p = new Lint(null!).call(e);
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/missing required key SERVER_PROTOCOL/);

  e = env();
  e["SERVER_PROTOCOL"] = "Foo";
  p = new Lint(null!).call(e);
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/env\[SERVER_PROTOCOL\] does not match HTTP/);

  p = new Lint(null!).call(env({ HTTP_CONTENT_TYPE: "text/plain" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/contains HTTP_CONTENT_TYPE/);

  p = new Lint(null!).call(env({ HTTP_CONTENT_LENGTH: "42" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/contains HTTP_CONTENT_LENGTH/);

  p = new Lint(null!).call(env({ FOO: new (class Object {})() }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/non-string value/);

  p = new Lint(null!).call(env({ "rack.url_scheme": "gopher" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/url_scheme unknown/);

  p = new Lint(null!).call(env({ "rack.session": [] }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("session [] must respond to store and []=");

  expect((await new Lint(validApp).call(env({ "rack.session": {} })))[0]).toBe(200);

  const obj: any = new (class Object {})();
  obj.inspect = () => "[]";
  p = new Lint(null!).call(env({ "rack.logger": obj }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("logger [] must respond to info");

  obj.info = () => {};
  p = new Lint(null!).call(env({ "rack.logger": obj }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("logger [] must respond to debug");

  obj.debug = () => {};
  p = new Lint(null!).call(env({ "rack.logger": obj }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("logger [] must respond to warn");

  obj.warn = () => {};
  p = new Lint(null!).call(env({ "rack.logger": obj }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("logger [] must respond to error");

  obj.error = () => {};
  p = new Lint(null!).call(env({ "rack.logger": obj }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("logger [] must respond to fatal");

  obj.fatal = () => {};
  expect((await new Lint(validApp).call(env({ "rack.logger": obj })))[0]).toBe(200);

  p = new Lint(null!).call(env({ "rack.multipart.buffer_size": 0 }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe(
    "rack.multipart.buffer_size must be an Integer > 0 if specified",
  );

  expect((await new Lint(validApp).call(env({ "rack.multipart.buffer_size": 1 })))[0]).toBe(200);

  p = new Lint(null!).call(env({ "rack.multipart.tempfile_factory": Tempfile }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe(
    "rack.multipart.tempfile_factory must respond to #call",
  );

  p = new Lint(async (env) =>
    env["rack.multipart.tempfile_factory"]("testfile", "text/plain"),
  ).call(
    env({
      "rack.multipart.tempfile_factory": (_filename: string, _contentType: string) =>
        new (class Object {})(),
    }),
  );
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe(
    "rack.multipart.tempfile_factory return value must respond to #<<",
  );

  p = new Lint(async (env) => {
    env["rack.multipart.tempfile_factory"]("testfile", "text/plain");
    return [] as any;
  }).call(
    env({
      "rack.multipart.tempfile_factory": (_filename: string, _contentType: string) => "",
    }),
  );
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("response array has 0 elements instead of 3");

  p = new Lint(null!).call(env({ SERVER_PORT: "howdy" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("env[SERVER_PORT] is not an Integer");

  p = new Lint(null!).call(env({ SERVER_NAME: "\u1234" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("\u1234 must be a valid authority");

  p = new Lint(null!).call(env({ HTTP_HOST: "\u1234" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("\u1234 must be a valid authority");

  p = new Lint(null!).call(env({ REQUEST_METHOD: "FUCKUP?" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/REQUEST_METHOD/);

  p = new Lint(null!).call(env({ REQUEST_METHOD: "OOPS?\b!" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/OOPS\?\\/);

  p = new Lint(null!).call(env({ SCRIPT_NAME: "howdy" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/must start with/);

  p = new Lint(null!).call(env({ CONTENT_LENGTH: "xcii" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/Invalid CONTENT_LENGTH/);

  p = new Lint(null!).call(env({ QUERY_STRING: null }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toContain(
    "env variable QUERY_STRING has non-string value nil",
  );

  p = new Lint(null!).call(env({ QUERY_STRING: "\u1234" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toContain(
    "env variable QUERY_STRING has value containing non-ASCII characters and has non-ASCII-8BIT encoding",
  );

  expect(
    (
      await new Lint(async () => [200, {}, []]).call(
        env({ QUERY_STRING: new TextEncoder().encode("\u1234") }),
      )
    )[0],
  ).toBe(200);

  e = env();
  delete e["PATH_INFO"];
  delete e["SCRIPT_NAME"];
  p = new Lint(null!).call(e);
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/One of .* must be set/);

  p = new Lint(null!).call(env({ SCRIPT_NAME: "/" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/cannot be .* make it ''/);

  p = new Lint(null!).call(env({ "rack.response_finished": "not a callable" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /rack.response_finished must be an array of callable objects/,
  );

  p = new Lint(null!).call(
    env({ "rack.response_finished": [(_env: unknown) => {}, "not a callable"] }),
  );
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /rack.response_finished values must respond to call/,
  );
});

it("notice input errors", async () => {
  let p = new Lint(null!).call(env({ "rack.input": "" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/does not respond to #gets/);

  let input: any = new (class Object {})();
  input.isBinmode = () => false;
  p = new Lint(null!).call(env({ "rack.input": input }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/is not opened in binary mode/);

  input = new (class Object {})();
  input.externalEncoding = () => {
    const result: any = new (class Object {})();
    result.name = () => "US-ASCII";
    return result;
  };
  p = new Lint(null!).call(env({ "rack.input": input }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /does not have ASCII-8BIT as its external encoding/,
  );
});

it("notice error errors", async () => {
  const io = new StringIO();
  io.binmode();
  const p = new Lint(null!).call(env({ "rack.errors": "", "rack.input": io }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/does not respond to #puts/);
});

it("notice response errors", async () => {
  let p = new Lint(async () => "" as any).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toContain("response is not an Array, but String");

  p = new Lint(async () => [null, null, null, null] as any).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toContain("response array has 4 elements instead of 3");
});

it("accepts empty PATH_INFO", async () => {
  expect((await new Lint(validApp).call(env({ PATH_INFO: "" })))[0]).toBe(200);
});

it("notices request-target asterisk form errors", async () => {
  expect(
    (await new Lint(validApp).call(env({ REQUEST_METHOD: "OPTIONS", PATH_INFO: "*" })))[0],
  ).toBe(200);

  const p = new Lint(null!).call(env({ PATH_INFO: "*" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /Only OPTIONS requests may have PATH_INFO set to '\*'/,
  );
});

it("notices request-target authority form errors", async () => {
  expect(
    (
      await new Lint(validApp).call(env({ REQUEST_METHOD: "CONNECT", PATH_INFO: "example.com:80" }))
    )[0],
  ).toBe(200);

  const p = new Lint(null!).call(env({ PATH_INFO: "example.com:80" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /Only CONNECT requests may have PATH_INFO set to an authority/,
  );

  void (async () => {
    expect((await new Lint(null!).call(env({ PATH_INFO: "/:80" })))[0]).toBe(200);
  });
});

it("notices request-target absolute-form errors", async () => {
  expect(
    (await new Lint(validApp).call(env({ REQUEST_METHOD: "GET", PATH_INFO: "http://foo/bar" })))[0],
  ).toBe(200);

  let p = new Lint(null!).call(env({ REQUEST_METHOD: "CONNECT", PATH_INFO: "http://foo/bar" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /CONNECT and OPTIONS requests must not have PATH_INFO set to a URI/,
  );

  p = new Lint(null!).call(env({ REQUEST_METHOD: "OPTIONS", PATH_INFO: "http://foo/bar" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /CONNECT and OPTIONS requests must not have PATH_INFO set to a URI/,
  );
});

it("notices request-target origin-form errors", async () => {
  expect(
    (await new Lint(validApp).call(env({ REQUEST_METHOD: "GET", PATH_INFO: "/foo/bar" })))[0],
  ).toBe(200);

  let p = new Lint(null!).call(env({ REQUEST_METHOD: "GET", PATH_INFO: "../etc/passwd" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/PATH_INFO must start with a '\/'/);

  p = new Lint(null!).call(env({ REQUEST_METHOD: "GET", PATH_INFO: "/foo/bar#qux" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/PATH_INFO.*must not include a fragment/);

  p = new Lint(null!).call(env({ REQUEST_METHOD: "GET", PATH_INFO: "/foo/bar?baz#qux" }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/PATH_INFO.*must not include a fragment/);
});

it("notice status errors", async () => {
  let p = new Lint(async () => ["cc", {}, ""] as any).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/must be an Integer >=100/);

  p = new Lint(async () => [42, {}, ""] as any).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/must be an Integer >=100/);

  p = new Lint(async () => ["200", {}, ""] as any).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/must be an Integer >=100/);
});

it("notice header errors", async () => {
  const lint = (headers: unknown) =>
    new Lint(async () => [200, headers as Record<string, string>, []]).call(env({}));

  await expect(lint(Object.freeze({}))).rejects.toThrow(
    "headers object should not be frozen, but is",
  );
  await expect(lint({ status: "404" })).rejects.toThrow(/must not contain status/);
  for (const invalidHeader of ["(", ",", "/", "@", "\\", "{", "\x7F", "\x01"]) {
    await expect(lint({ [invalidHeader]: "text/plain" })).rejects.toThrow(
      `invalid header name: ${invalidHeader}`,
    );
  }
  await expect(lint({ A: "text/plain" })).rejects.toThrow("uppercase character in header name: A");
  await expect(lint({ foo: new (class Object {})() })).rejects.toThrow(
    "a header value must be a String or Array of Strings, but the value of 'foo' is a Object",
  );
  await expect(lint({ "foo-bar": "text\0plain" })).rejects.toThrow(/invalid header/);
  await expect(
    lint([
      ["content-type", "text/plain"],
      ["content-length", "0"],
    ]),
  ).rejects.toThrow("headers object should be a hash, but isn't (got Array as headers)");
});

it("notice rack.early_hints errors", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.early_hints": "not a function" });
  await expect(app.call(e)).rejects.toThrow(LintError);
});

it("notice content-type errors", async () => {
  for (const status of [100, 101, 204, 304]) {
    const p = new Lint(async () => [
      status,
      { "content-type": "text/plain", "content-length": "0" },
      [],
    ]).call(env({}));
    await expect(p).rejects.toThrow(LintError);
    expect((await p.catch((e) => e)).message).toMatch(/content-type header found/);
  }
});

it("notice content-length errors", async () => {
  for (const status of [100, 101, 204, 304]) {
    const p = new Lint(async () => [status, { "content-length": "0" }, []]).call(env({}));
    await expect(p).rejects.toThrow(LintError);
    expect((await p.catch((e) => e)).message).toMatch(/content-length header found/);
  }

  const p = (async () =>
    (
      await new Lint(async () => [
        200,
        { "content-type": "text/plain", "content-length": "1" },
        [],
      ]).call(env({}))
    )[2].each(() => {}))();
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/content-length header was 1, but should be 0/);
});

it("responds to to_path", async () => {
  const body = {
    toPath() {
      return "/tmp/file";
    },
    forEach(cb: any) {
      cb("data");
    },
    close() {},
  };
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, body]);
  const [, , b] = await app.call(env({}));
  expect(b).toBeDefined();
});

it("handles body.to_path returning nil", async () => {
  const body = {
    forEach(cb: any) {
      cb("ok");
    },
    toPath() {
      return null;
    },
  };
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, body]);
  const [status] = await app.call(env({}));
  expect(status).toBe(200);
});

it("notice body errors", async () => {
  const bodyOf = async (body: unknown, contentLength: string) =>
    (
      await new Lint(async () => [
        200,
        { "content-type": "text/plain", "content-length": contentLength },
        body,
      ]).call(env({}))
    )[2];

  const nonString = await bodyOf([1, 2, 3], "3");
  expect(() => nonString.each(() => {})).toThrow(/yielded non-string/);

  const object = await bodyOf(new (class Object {})(), "3");
  expect(rbObjRespondTo(object, "toAry")).toBe(false);
  expect(() => object.each(() => {})).toThrow("Enumerable Body must respond to each");

  const empty = await bodyOf([], "0");
  empty.each(() => {});
  expect(() => empty.each(() => {})).toThrow("Response body must only be invoked once (each)");

  const stackedLint = (app: RackApp, block: (body: any) => any) =>
    new Lint(async (env) => {
      const response = await new Lint(app).call(env);
      response[2] = block(response[2]);
      return response;
    });
  const arrayMismatch: RackApp = async () => {
    const input = {
      toAry: () => Array(10).fill("bar"),
      each: (yieldBlock: (s: string) => void) => {
        for (let i = 0; i < 10; i++) yieldBlock("foo");
      },
    };
    return [200, { "content-type": "text/plain", "content-length": "30" }, input];
  };
  await expect(stackedLint(arrayMismatch, (body) => body.toAry()).call(env({}))).rejects.toThrow(
    /#to_ary not identical to contents produced by calling #each/,
  );
});

it("notice input handling errors", async () => {
  let p = new Lint(async (env) => {
    env["rack.input"].gets("\r\n");
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/gets called with arguments/);

  p = new Lint(async (env) => {
    env["rack.input"].gets();
    env["rack.input"].read(1, 2, 3);
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/read called with too many arguments/);

  p = new Lint(async (env) => {
    env["rack.input"].read("foo");
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /read called with non-integer and non-nil length/,
  );

  p = new Lint(async (env) => {
    env["rack.input"].read(-1);
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/read called with a negative length/);

  p = new Lint(async (env) => {
    env["rack.input"].read(null, null);
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/read called with non-String buffer/);

  p = new Lint(async (env) => {
    env["rack.input"].read(null, 1);
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/read called with non-String buffer/);

  const weirdio = {
    gets() {
      return 42;
    },
    read() {
      return 23;
    },
    each(block: (x: unknown) => void) {
      block(23);
      block(42);
    },
  };

  const eofWeirdio = {
    gets() {
      return null;
    },
    read(..._args: unknown[]) {
      return null;
    },
    each() {},
  };

  p = new Lint(async (env) => {
    env["rack.input"].gets();
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({ "rack.input": weirdio }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/gets didn't return a String/);

  p = new Lint(async (env) => {
    env["rack.input"].each(1, () => {});
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({ "rack.input": weirdio }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/rack.input#each called with arguments/);

  p = new Lint(async (env) => {
    env["rack.input"].each(() => {});
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({ "rack.input": weirdio }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/each didn't yield a String/);

  p = new Lint(async (env) => {
    env["rack.input"].read();
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({ "rack.input": weirdio }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/read didn't return nil or a String/);

  p = new Lint(async (env) => {
    env["rack.input"].read();
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({ "rack.input": eofWeirdio }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/read\(nil\) returned nil on EOF/);
});

it("can call close", async () => {
  const app: RackApp = async (env) => {
    env["rack.input"].close();
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  };

  const response = await new Lint(app).call(env({}));

  expect(response[0]).toBe(201);
});

it("notice error handling errors", async () => {
  let p = new Lint(async (env) => {
    env["rack.errors"].write(42);
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/write not called with a String/);

  p = new Lint(async (env) => {
    env["rack.errors"].close();
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({}));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/close must not be called/);
});

it("notice HEAD errors", async () => {
  expect(
    (
      await new Lint(async () => [
        200,
        { "content-type": "test/plain", "content-length": "3" },
        [],
      ]).call(env({ REQUEST_METHOD: "HEAD" }))
    )[0],
  ).toBe(200);

  const p = (async () =>
    (
      await new Lint(async () => [
        200,
        { "content-type": "test/plain", "content-length": "3" },
        ["foo"],
      ]).call(env({ REQUEST_METHOD: "HEAD" }))
    )[2].each(() => {}))();
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/body was given for HEAD/);
});

async function assertLint(...args: unknown[]) {
  const helloStr = forceEncoding("hello world", Encoding.ASCII_8BIT);

  expect(
    (
      await new Lint(async (env) => {
        env["rack.input"].read(...args);
        return [201, { "content-type": "text/plain", "content-length": "0" }, []];
      }).call(env({ "rack.input": new StringIO(helloStr) }))
    )[0],
  ).toBe(201);
}

it("pass valid read calls", async () => {
  await assertLint();
  await assertLint(0);
  await assertLint(1);
  await assertLint(null);
  await assertLint(null, "");
  await assertLint(1, "");
});

it("notices when request env doesn't have a valid rack.hijack callback", async () => {
  const p = new Lint(async (env) => {
    env["rack.hijack"].call();
    return [201, { "content-type": "text/plain", "content-length": "0" }, []];
  }).call(env({ "rack.hijack": new (class Object {})() }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(/rack.hijack must respond to call/);
});

it("handles valid rack.hijack env", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": () => ({}) });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("notices when rack.hijack env entry does not respond to #call", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": 42 });
  await expect(app.call(e)).rejects.toThrow(LintError);
});

it("notices when rack.hijack env entry does not return an IO", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": () => "not-io" });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("handles valid rack.hijack response header", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const [status] = await app.call(env({ "rack.hijack?": true, "rack.hijack": () => ({}) }));
  expect(status).toBe(200);
});

it("allows non-hijack responses when server supports hijacking", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.hijack?": true, "rack.hijack": () => ({}) });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("notices when the response headers don't have a valid rack.hijack callback", async () => {
  const p = new Lint(async () => [
    201,
    {
      "content-type": "text/plain",
      "content-length": "0",
      "rack.hijack": new (class Object {})() as any,
    },
    [],
  ]).call(env({ "rack.hijack?": true }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toBe("rack.hijack header must respond to #call");
});

it("notices when the response headers has a rack.hijack callback with hijacking being supported", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({
    "rack.hijack?": true,
    "rack.hijack": () => ({
      read() {
        return "";
      },
    }),
  });
  const [status] = await app.call(e);
  expect(status).toBe(200);
});

it("notices rack.response_finished errors", async () => {
  const app = new Lint(async () => [200, { "content-type": "text/plain" }, ["OK"]]);
  const e = env({ "rack.response_finished": "not an array" });
  await expect(app.call(e)).rejects.toThrow(LintError);
});

it("pass valid rack.response_finished", async () => {
  const callableObject = new (class {
    call(_env: unknown, _status: unknown, _headers: unknown, _error: unknown) {}
  })();

  expect(
    (
      await new Lint(async () => [200, {}, ["foo"]]).call(
        env({
          "rack.response_finished": [(_env: unknown) => {}, (_env: unknown) => {}, callableObject],
          "content-length": "3",
        }),
      )
    )[0],
  ).toBe(200);
});

it("notices when the response protocol is not an array of strings", async () => {
  const app = new Lint(async () => [
    200,
    { "content-type": "text/plain", "rack.protocol": "h2" },
    ["OK"],
  ]);
  await expect(app.call(env({}))).rejects.toThrow(LintError);
});

it("notices when the response protocol is specified in the response but not in the request", async () => {
  const app = new Lint(async () => [101, { "rack.protocol": "websocket" }, ["foo"]]);

  const p = app.call(env());
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /rack.protocol header is "websocket", but rack.protocol was not set in request/,
  );
});

it("notices when the response protocol is specified in the response but not in the request", async () => {
  const app = new Lint(async () => [101, { "rack.protocol": "websocket" }, ["foo"]]);

  const p = app.call(env({ "rack.protocol": ["smtp"] }));
  await expect(p).rejects.toThrow(LintError);
  expect((await p.catch((e) => e)).message).toMatch(
    /rack.protocol header is "websocket", but should be one of \["smtp"\] from the request!/,
  );
});

it("pass valid rack.protocol", async () => {
  const app = new Lint(async () => [101, { "rack.protocol": "websocket" }, ["foo"]]);

  const response = await app.call(env({ "rack.protocol": ["websocket"] }));

  expect(response[0]).toBe(101);
});
