import { it, expect } from "vitest";
import { RuntimeError, StringIO } from "@blazetrails/ruby-compat";
import { ShowExceptions } from "./show-exceptions.js";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

function showExceptions(app: any) {
  return new Lint(new ShowExceptions(app));
}

it("catches exceptions", async () => {
  const req = new MockRequest(
    showExceptions(() => {
      throw new RuntimeError();
    }),
  );

  const res = await req.get("/", { HTTP_ACCEPT: "text/html" });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);

  expect(res.body).toMatch(/RuntimeError/);
  expect(res.body).toMatch(/ShowExceptions/);
  expect(res.body).toMatch(/No GET data/);
  expect(res.body).toMatch(/No POST data/);
});

it("handles exceptions with backtrace lines for files that are not readable", async () => {
  const req = new MockRequest(
    showExceptions(() => {
      const err = new RuntimeError("foo");
      err.stack =
        "RuntimeError: foo\n    nonexistent.rb:2:in `a': adf (RuntimeError)\n    bad-backtrace";
      throw err;
    }),
  );

  const res = await req.get("/", { HTTP_ACCEPT: "text/html" });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);

  expect(res.body).toContain("RuntimeError");
  expect(res.body).toContain("ShowExceptions");
  expect(res.body).toContain("No GET data");
  expect(res.body).toContain("No POST data");
  expect(res.body).toContain("nonexistent.rb");
  expect(res.body).not.toContain("bad-backtrace");
});

it("handles invalid POST data exceptions", async () => {
  const req = new MockRequest(
    showExceptions(() => {
      throw new RuntimeError();
    }),
  );

  const res = await req.post("/", {
    HTTP_ACCEPT: "text/html",
    "rack.input": new StringIO("(%bad-params%)"),
  });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);

  expect(res.body).toMatch(/RuntimeError/);
  expect(res.body).toMatch(/ShowExceptions/);
  expect(res.body).toMatch(/No GET data/);
  expect(res.body).toMatch(/Invalid POST data/);
});

it("works with binary data in the Rack environment", async () => {
  const req = new MockRequest(
    showExceptions((env: Record<string, any>) => {
      env["foo"] = "\xCC";
      throw new RuntimeError();
    }),
  );

  const res = await req.get("/", { HTTP_ACCEPT: "text/html" });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);

  expect(res.body).toMatch(/RuntimeError/);
  expect(res.body).toMatch(/ShowExceptions/);
});

it("responds with HTML only to requests accepting HTML", async () => {
  const req = new MockRequest(
    showExceptions(() => {
      throw new RuntimeError("It was never supposed to work");
    }),
  );

  for (const [exmime, rargs] of [
    ["text/html", ["/", { HTTP_ACCEPT: "text/html" }]],
    ["text/html", ["/", { HTTP_ACCEPT: "*/*" }]],
    ["text/plain", ["/"]],
    ["text/plain", ["/", { HTTP_ACCEPT: "application/json" }]],
  ] as [string, [string, Record<string, any>?]][]) {
    const res = await req.get(...rargs);

    expect(res.isServerError).toBeTruthy();
    expect(res.status).toBe(500);

    expect(res.contentType).toBe(exmime);

    expect(res.body).toContain("RuntimeError");
    expect(res.body).toContain("It was never supposed to work");

    if (exmime === "text/html") {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(res.body).toContain("</html>");
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(res.body).not.toContain("</html>");
    }
  }
});

it("handles exceptions without a backtrace", async () => {
  const req = new MockRequest(
    showExceptions(() => {
      const err = new RuntimeError("");
      err.stack = undefined;
      throw err;
    }),
  );

  const res = await req.get("/", { HTTP_ACCEPT: "text/html" });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);

  expect(res.body).toMatch(/RuntimeError/);
  expect(res.body).toMatch(/ShowExceptions/);
  expect(res.body).toMatch(/unknown location/);
});

it("allows subclasses to override template", async () => {
  const TEMPLATE = () => "foo";
  const c = class extends ShowExceptions {
    protected override template() {
      return TEMPLATE;
    }
  };

  const app = () => {
    const err = new RuntimeError("");
    err.stack = undefined;
    throw err;
  };

  const req = new MockRequest(new Lint(new c(app)));

  const res = await req.get("/", { HTTP_ACCEPT: "text/html" });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);
  expect(res.body).toBe("foo");
});

it("knows to prefer plaintext for non-html", () => {
  const exc = new ShowExceptions(null as any);

  for (const [env, expected] of [
    [{ HTTP_ACCEPT: "text/plain" }, true],
    [{ HTTP_ACCEPT: "text/foo" }, true],
    [{ HTTP_ACCEPT: "text/html" }, false],
  ] as [Record<string, string>, boolean][]) {
    expect(exc.prefersPlaintext(env)).toEqual(expected);
  }
});

it("prefers Exception#detailed_message instead of Exception#message if available", async () => {
  const customExcClass = class extends RuntimeError {
    override detailedMessage(_opt?: { highlight?: boolean | null } | null) {
      return "detailed_message_test";
    }
  };

  const req = new MockRequest(
    showExceptions(() => {
      throw new customExcClass();
    }),
  );

  const res = await req.get("/", { HTTP_ACCEPT: "text/html" });

  expect(res.isServerError).toBeTruthy();
  expect(res.status).toBe(500);

  expect(res.body).toMatch(/detailed_message_test/);
  expect(res.body).toMatch(/ShowExceptions/);
  expect(res.body).toMatch(/No GET data/);
  expect(res.body).toMatch(/No POST data/);
});
