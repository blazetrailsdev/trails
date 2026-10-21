import { it, expect, vi } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { CommonLogger } from "./common-logger.js";
import { MockRequest } from "./mock-request.js";
import { Lint } from "./lint.js";

const length = 6;
const app = (env: any) =>
  new Lint(
    async () =>
      [200, { "content-type": "text/html", "content-length": String(length) }, ["foobar"]] as any,
  ).call(env);
const appWithoutLength = (env: any) =>
  new Lint(async () => [200, { "content-type": "text/html" }, []] as any).call(env);
const appWithoutLint = async () =>
  [200, { "content-type": "text/html", "content-length": String(length) }, ["foobar"]] as any;
const appWithZeroLength = (env: any) =>
  new Lint(
    async () => [200, { "content-type": "text/html", "content-length": "0" }, []] as any,
  ).call(env);

it("log to rack.errors by default", async () => {
  const res = await new MockRequest((env) => new CommonLogger(app).call(env)).get("/");
  expect(res.errors!.length === 0).toBeFalsy();
  expect(res.errors).toMatch(/"GET \/ HTTP\/1\.1" 200 6 /);
});

it("log to anything with +write+", async () => {
  const log = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/");
  expect(log.str).toMatch(/"GET \/ HTTP\/1\.1" 200 6 /);
});

it("work with standard library logger", async () => {
  const logdev = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  const log = {
    append(msg: string) {
      logdev.write(msg + "\n");
    },
  };
  await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/");
  expect(logdev.str).toMatch(/"GET \/ HTTP\/1\.1" 200 6 /);
});

it("log - content length if header is missing", async () => {
  const res = await new MockRequest((env) => new CommonLogger(appWithoutLength).call(env)).get("/");
  expect(res.errors!.length === 0).toBeFalsy();
  expect(res.errors).toMatch(/"GET \/ HTTP\/1\.1" 200 - /);
});

it("log - content length if header is zero", async () => {
  const res = await new MockRequest((env) => new CommonLogger(appWithZeroLength).call(env)).get(
    "/",
  );
  expect(res.errors!.length === 0).toBeFalsy();
  expect(res.errors).toMatch(/"GET \/ HTTP\/1\.1" 200 - /);
});

it("log - records host from X-Forwarded-For header", async () => {
  const res = await new MockRequest((env) => new CommonLogger(app).call(env)).get("/", {
    HTTP_X_FORWARDED_FOR: "203.0.113.0",
  });
  expect(res.errors!.length === 0).toBeFalsy();
  expect(res.errors).toMatch(/203\.0\.113\.0 - /);
});

it("log - records host from RFC 7239 forwarded for header", async () => {
  const res = await new MockRequest((env) => new CommonLogger(app).call(env)).get("/", {
    HTTP_FORWARDED: "for=203.0.113.0",
  });
  expect(res.errors!.length === 0).toBeFalsy();
  expect(res.errors).toMatch(/203\.0\.113\.0 - /);
});

it("log in common log format", async () => {
  const log = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  const t = 0;
  const now = vi.spyOn(Time, "now").mockImplementation(() => Time.at(t));
  try {
    await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/", {
      QUERY_STRING: "foo=bar",
    });
  } finally {
    now.mockRestore();
  }

  const md = /- - - \[([^\]]+)\] "(\w+) \/\?foo=bar HTTP\/1\.1" (\d{3}) \d+ ([\d.]+)/.exec(log.str);
  expect(md).not.toEqual(null);
  const [, time, method, status, duration] = md!;
  expect(time).toBe(Time.at(0).strftime("%d/%b/%Y:%H:%M:%S %z"));
  expect(method).toBe("GET");
  expect(status).toBe("200");
  expect(new Range(0, 1).isInclude(parseFloat(duration))).toBeTruthy();
});

it("escapes non printable characters including newline", async () => {
  const logdev = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  const log = {
    append(msg: string) {
      logdev.write(msg + "\n");
    },
  };
  await new MockRequest((env) => new CommonLogger(appWithoutLint, log).call(env)).request(
    "GET\x1f",
    "/hello",
  );

  expect(logdev.str).toMatch(/GET\\x1f \/hello HTTP\/1\.1/);

  await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/", {
    REMOTE_USER: "foo\nbar",
    QUERY_STRING: "bar\nbaz",
  });
  expect(logdev.str[logdev.str.length - 1]).toBe("\n");
  expect(logdev.str).toContain("foo\\xabar");
  expect(logdev.str).toContain("bar\\xabaz");
});

it("log path with PATH_INFO", async () => {
  const logdev = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  const log = {
    append(msg: string) {
      logdev.write(msg + "\n");
    },
  };
  await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/hello");
  expect(logdev.str).toMatch(/"GET \/hello HTTP\/1\.1" 200 6 /);
});

it("log path with SCRIPT_NAME", async () => {
  const logdev = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  const log = {
    append(msg: string) {
      logdev.write(msg + "\n");
    },
  };
  await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/path", {
    ":script_name": "/script",
  });
  expect(logdev.str).toMatch(/"GET \/script\/path HTTP\/1\.1" 200 6 /);
});

it("log path with SERVER_PROTOCOL", async () => {
  const logdev = {
    str: "",
    write(s: string) {
      this.str += s;
    },
  };
  const log = {
    append(msg: string) {
      logdev.write(msg + "\n");
    },
  };
  await new MockRequest((env) => new CommonLogger(app, log).call(env)).get("/path", {
    ":http_version": "HTTP/1.0",
  });
  expect(logdev.str).toMatch(/"GET \/path HTTP\/1\.0" 200 6 /);
});
