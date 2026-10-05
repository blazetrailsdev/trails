import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { assertNothingRaised, assertRaises, include } from "@blazetrails/activesupport";
import { SecureRandom, rbFSend, type Bytes } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import {
  InvalidAuthenticityToken,
  InvalidCrossOriginRequest,
  RequestForgeryProtection,
  decodeCsrfToken,
} from "../metal/request-forgery-protection.js";
import "../../test-helpers/abstract-unit.js";

interface ActionsHost {
  sameOriginJs(): Promise<void>;
  negotiateSameOrigin(): Promise<void>;
}

const RequestForgeryProtectionActions = {
  async index(this: Base): Promise<void> {
    await this.render({ plain: "" });
  },

  async unsafe(this: Base): Promise<void> {
    await this.render({ plain: "pwn" });
  },

  async sameOriginJs(this: Base): Promise<void> {
    await this.render({ js: "foo();" });
  },

  async negotiateSameOrigin(this: Base & ActionsHost): Promise<void> {
    await this.respondTo((format) => {
      format.js(() => this.sameOriginJs());
    });
  },

  async crossOriginJs(this: Base & ActionsHost): Promise<void> {
    await this.sameOriginJs();
  },

  async negotiateCrossOrigin(this: Base & ActionsHost): Promise<void> {
    await this.negotiateSameOrigin();
  },
};

class RequestForgeryProtectionControllerUsingResetSession extends Base {}
include(RequestForgeryProtectionControllerUsingResetSession, RequestForgeryProtectionActions);
RequestForgeryProtectionControllerUsingResetSession.protectFromForgery({
  only: ["index", "meta", "sameOriginJs", "negotiateSameOrigin"],
  with: "reset_session",
});

class RequestForgeryProtectionControllerUsingException extends Base {}
include(RequestForgeryProtectionControllerUsingException, RequestForgeryProtectionActions);
RequestForgeryProtectionControllerUsingException.protectFromForgery({
  only: ["index", "meta", "sameOriginJs", "negotiateSameOrigin"],
  with: "exception",
});

class RequestForgeryProtectionControllerUsingNullSession extends Base {
  async tryToResetSession(): Promise<void> {
    this.resetSession();
    this.head("ok");
  }
}
RequestForgeryProtectionControllerUsingNullSession.protectFromForgery({ with: "null_session" });

class FreeCookieController extends RequestForgeryProtectionControllerUsingResetSession {}
FreeCookieController.allowForgeryProtection = false;

class CustomAuthenticityParamController extends RequestForgeryProtectionControllerUsingResetSession {
  formAuthenticityParam(): unknown {
    return "foobar";
  }
}

class PerFormTokensController extends Base {
  async index(): Promise<void> {
    await this.render({
      inline:
        "<%= context.formTag(context.params.get('form_path') ?? '/per_form_tokens/post_one', { method: context.params.get('form_method') }) %>",
    });
  }

  async buttonTo(): Promise<void> {
    await this.render({
      inline:
        "<%= context.buttonTo('Button', context.params.get('form_path') ?? '/per_form_tokens/post_one', { method: context.params.get('form_method') }) %>",
    });
  }

  async postOne(): Promise<void> {
    await this.render({ plain: "" });
  }

  async postTwo(): Promise<void> {
    await this.render({ plain: "" });
  }
}
PerFormTokensController.protectFromForgery({ with: "exception" });
PerFormTokensController.perFormCsrfTokens = true;

class MockLogger {
  private _logged = new Map<string, string[]>();

  logged(level: string): string[] {
    return this._logged.get(level) ?? [];
  }

  debug(message: string): void {
    this.add("debug", message);
  }

  info(message: string): void {
    this.add("info", message);
  }

  warn(message: string): void {
    this.add("warn", message);
  }

  error(message: string): void {
    this.add("error", message);
  }

  private add(level: string, message: string): void {
    this._logged.set(level, [...this.logged(level), message]);
  }
}

const TOKEN = Buffer.from("railstestrailstestrailstestrails").toString("base64url") + "=";

describe("ActionController::RequestForgeryProtection", () => {
  let tc: TestCase;
  let oldRequestForgeryProtectionToken: string | null;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new RequestForgeryProtectionControllerUsingResetSession();
    await tc.beforeSetup();
    oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    Base.requestForgeryProtectionToken = "custom_authenticity_token";
  });

  afterEach(() => {
    Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
  });

  function initializeCsrfToken(token = TOKEN): void {
    tc.session().set("_csrf_token", token);
  }

  async function assertBlocked(block: () => Promise<unknown>): Promise<void> {
    tc.session().set("something_like_user_id", 1);
    await block();
    expect(
      tc.session().get("something_like_user_id"),
      "session values are still present",
    ).toBeUndefined();
    tc.assertResponse("success");
  }

  async function assertNotBlocked(block: () => Promise<unknown>): Promise<void> {
    tc.session().set("something_like_user_id", 1);
    await assertNothingRaised(block);
    expect(tc.session().get("something_like_user_id")).toBe(1);
    tc.assertResponse("success");
  }

  async function forgeryProtectionOriginCheck(block: () => Promise<unknown>): Promise<void> {
    const oldSetting = Base.forgeryProtectionOriginCheck;
    Base.forgeryProtectionOriginCheck = true;
    try {
      await block();
    } finally {
      Base.forgeryProtectionOriginCheck = oldSetting;
    }
  }

  it("should allow get", async () => {
    await assertNotBlocked(() => tc.get("index"));
  });

  it("should allow head", async () => {
    await assertNotBlocked(() => tc.head("index"));
  });

  it("should allow post without token on unsafe action", async () => {
    await assertNotBlocked(() => tc.post("unsafe"));
  });

  it("should not allow post without token", async () => {
    await assertBlocked(() => tc.post("index"));
  });

  it("should not allow post without token irrespective of format", async () => {
    await assertBlocked(() => tc.post("index", { params: { format: "xml" } }));
  });

  it("should not allow patch without token", async () => {
    await assertBlocked(() => tc.patch("index"));
  });

  it("should not allow put without token", async () => {
    await assertBlocked(() => tc.put("index"));
  });

  it("should not allow delete without token", async () => {
    await assertBlocked(() => tc.delete("index"));
  });

  it("should not allow xhr post without token", async () => {
    await assertBlocked(() => tc.post("index", { xhr: true }));
  });

  it("should allow post with token", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() =>
      tc.post("index", { params: { custom_authenticity_token: TOKEN } }),
    );
  });

  it("should allow post with strict encoded token", async () => {
    const tokenLength = Math.ceil((32 * 4.0) / 3);
    const tokenIncludingUrlUnsafeChars = "+/".padEnd(tokenLength, "A");
    initializeCsrfToken(tokenIncludingUrlUnsafeChars);
    await assertNotBlocked(() =>
      tc.post("index", { params: { custom_authenticity_token: tokenIncludingUrlUnsafeChars } }),
    );
  });

  it("should allow patch with token", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() =>
      tc.patch("index", { params: { custom_authenticity_token: TOKEN } }),
    );
  });

  it("should allow put with token", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() => tc.put("index", { params: { custom_authenticity_token: TOKEN } }));
  });

  it("should allow delete with token", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() =>
      tc.delete("index", { params: { custom_authenticity_token: TOKEN } }),
    );
  });

  it("should allow post with token in header", async () => {
    initializeCsrfToken();
    tc.request.env["HTTP_X_CSRF_TOKEN"] = TOKEN;
    await assertNotBlocked(() => tc.post("index"));
  });

  it("should allow delete with token in header", async () => {
    initializeCsrfToken();
    tc.request.env["HTTP_X_CSRF_TOKEN"] = TOKEN;
    await assertNotBlocked(() => tc.delete("index"));
  });

  it("should allow patch with token in header", async () => {
    initializeCsrfToken();
    tc.request.env["HTTP_X_CSRF_TOKEN"] = TOKEN;
    await assertNotBlocked(() => tc.patch("index"));
  });

  it("should allow put with token in header", async () => {
    initializeCsrfToken();
    tc.request.env["HTTP_X_CSRF_TOKEN"] = TOKEN;
    await assertNotBlocked(() => tc.put("index"));
  });

  it("should allow post with origin checking and correct origin", async () => {
    await forgeryProtectionOriginCheck(async () => {
      initializeCsrfToken();
      tc.request.setHeader("HTTP_ORIGIN", "http://test.host");
      await assertNotBlocked(() =>
        tc.post("index", { params: { custom_authenticity_token: TOKEN } }),
      );
    });
  });

  it("should allow post with origin checking and no origin", async () => {
    await forgeryProtectionOriginCheck(async () => {
      initializeCsrfToken();
      await assertNotBlocked(() =>
        tc.post("index", { params: { custom_authenticity_token: TOKEN } }),
      );
    });
  });

  it("should raise for post with null origin", async () => {
    await forgeryProtectionOriginCheck(async () => {
      initializeCsrfToken();
      tc.request.setHeader("HTTP_ORIGIN", "null");
      const exception = await assertRaises([InvalidAuthenticityToken], {}, () =>
        tc.post("index", { params: { custom_authenticity_token: TOKEN } }),
      );
      expect(exception.message).toMatch("The browser returned a 'null' origin for a request");
    });
  });

  it("should block post with origin checking and wrong origin", async () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();
    Base.logger = logger as never;
    try {
      await forgeryProtectionOriginCheck(async () => {
        initializeCsrfToken();
        tc.request.setHeader("HTTP_ORIGIN", "http://bad.host");
        await assertBlocked(() =>
          tc.post("index", { params: { custom_authenticity_token: TOKEN } }),
        );
      });

      expect(logger.logged("warn").at(-1)).toMatch(
        "HTTP Origin header (http://bad.host) didn't match request.base_url (http://test.host)",
      );
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("should warn on missing csrf token", async () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();
    Base.logger = logger as never;

    try {
      await assertBlocked(() => tc.post("index"));

      expect(logger.logged("warn").length).toBe(1);
      expect(logger.logged("warn").at(-1)).toMatch(/CSRF token authenticity/);
    } finally {
      Base.logger = oldLogger;
    }
  });

  it("should not warn if csrf logging disabled", async () => {
    const oldLogger = Base.logger;
    const logger = new MockLogger();
    Base.logger = logger as never;
    Base.logWarningOnCsrfFailure = false;

    try {
      await assertBlocked(() => tc.post("index"));

      expect(logger.logged("warn").length).toBe(0);
    } finally {
      Base.logger = oldLogger;
      Base.logWarningOnCsrfFailure = true;
    }
  });

  it("csrf token is not saved if it is nil", async () => {
    await tc.get("index");
    (tc.controller as Base).commitCsrfToken(tc.request);
    expect(tc.session().get("_csrf_token")).toBeUndefined();
  });

  it("should not raise error if token is not a string", async () => {
    await assertBlocked(() =>
      tc.patch("index", {
        body: JSON.stringify({ custom_authenticity_token: 1 }),
        as: "json",
      }),
    );
  });
});

describe("RequestForgeryProtectionControllerUsingExceptionTest", () => {
  it("raised exception message explains why it occurred", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new RequestForgeryProtectionControllerUsingException();
    await tc.beforeSetup();
    const oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    const oldSetting = Base.forgeryProtectionOriginCheck;
    Base.requestForgeryProtectionToken = "custom_authenticity_token";
    Base.forgeryProtectionOriginCheck = true;
    try {
      tc.session().set("_csrf_token", TOKEN);
      tc.request.setHeader("HTTP_ORIGIN", "http://bad.host");
      const exception = await assertRaises([InvalidAuthenticityToken], {}, () =>
        tc.post("index", { params: { custom_authenticity_token: TOKEN } }),
      );
      expect(exception.message).toMatch(
        "HTTP Origin header (http://bad.host) didn't match request.base_url (http://test.host)",
      );
    } finally {
      Base.forgeryProtectionOriginCheck = oldSetting;
      Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
    }
  });

  it.skip("should render form with token tag", () => {});
  it.skip("should render button to with token tag", () => {});
  it.skip("should render form without token tag if remote", () => {});
  it.skip("should render form with token tag if remote and embedding token is on", () => {});
  it.skip("should render form with token tag if remote and external authenticity token requested and embedding is on", () => {});
  it.skip("should render form with token tag if remote and external authenticity token requested", () => {});
  it.skip("should render form with token tag if remote and authenticity token requested", () => {});
  it.skip("should render form with token tag with authenticity token requested", () => {});
  it.skip("should render form with with token tag if remote", () => {});
  it.skip("should render form with without token tag if remote and embedding token is off", () => {});
  it.skip("should render form with with token tag if remote and external authenticity token requested and embedding is on", () => {});
  it.skip("should render form with with token tag if remote and external authenticity token requested", () => {});
  it.skip("should render form with with token tag if remote and authenticity token requested", () => {});
  it.skip("should render form with with token tag with authenticity token requested", () => {});
  it.skip("should render form with with token tag if remote and embedding token is on", () => {});

  describe("same origin js", () => {
    let tc: TestCase;
    let oldRequestForgeryProtectionToken: string | null;

    beforeEach(async ({ task }) => {
      tc = new TestCase(task.name);
      tc.controller = new RequestForgeryProtectionControllerUsingException();
      await tc.beforeSetup();
      oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
      Base.requestForgeryProtectionToken = "custom_authenticity_token";
    });

    afterEach(() => {
      Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
    });

    async function assertCrossOriginBlocked(block: () => Promise<unknown>): Promise<void> {
      await assertRaises([InvalidCrossOriginRequest], {}, block);
    }

    async function assertCrossOriginNotBlocked(block: () => Promise<unknown>): Promise<void> {
      tc.session().set("something_like_user_id", 1);
      await assertNothingRaised(block);
      expect(tc.session().get("something_like_user_id")).toBe(1);
      tc.assertResponse("success");
    }

    it("should only allow same origin js get with xhr header", async () => {
      await assertCrossOriginBlocked(() => tc.get("sameOriginJs"));
      await assertCrossOriginBlocked(() => tc.get("sameOriginJs", { format: "js" }));
      await assertCrossOriginBlocked(() => {
        tc.request.accept = "text/javascript";
        return tc.get("negotiateSameOrigin");
      });

      await assertCrossOriginBlocked(() => {
        tc.request.accept = "application/javascript";
        return tc.get("negotiateSameOrigin");
      });

      await assertCrossOriginNotBlocked(() => tc.get("sameOriginJs", { xhr: true }));
      await assertCrossOriginNotBlocked(() => tc.get("sameOriginJs", { xhr: true, format: "js" }));
      await assertCrossOriginNotBlocked(() => {
        tc.request.accept = "text/javascript";
        return tc.get("negotiateSameOrigin", { xhr: true });
      });
    });

    it("should warn on not same origin js", async () => {
      const oldLogger = Base.logger;
      const logger = new MockLogger();
      Base.logger = logger as never;

      try {
        await assertCrossOriginBlocked(() => tc.get("sameOriginJs"));

        expect(logger.logged("warn").length).toBe(1);
        expect(logger.logged("warn").at(-1)).toMatch(
          /<script> tag on another site requested protected JavaScript/,
        );
      } finally {
        Base.logger = oldLogger;
      }
    });

    it("should not warn if csrf logging disabled and not same origin js", async () => {
      const oldLogger = Base.logger;
      const logger = new MockLogger();
      Base.logger = logger as never;
      Base.logWarningOnCsrfFailure = false;

      try {
        await assertCrossOriginBlocked(() => tc.get("sameOriginJs"));

        expect(logger.logged("warn").length).toBe(0);
      } finally {
        Base.logger = oldLogger;
        Base.logWarningOnCsrfFailure = true;
      }
    });

    it("should allow non get js without xhr header", async () => {
      tc.session().set("_csrf_token", TOKEN);
      await assertCrossOriginNotBlocked(() =>
        tc.post("sameOriginJs", { params: { custom_authenticity_token: TOKEN } }),
      );
      await assertCrossOriginNotBlocked(() =>
        tc.post("sameOriginJs", { params: { format: "js", custom_authenticity_token: TOKEN } }),
      );
      await assertCrossOriginNotBlocked(() => {
        tc.request.accept = "text/javascript";
        return tc.post("negotiateSameOrigin", { params: { custom_authenticity_token: TOKEN } });
      });
    });

    it("should only allow cross origin js get without xhr header if protection disabled", async () => {
      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs"));
      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs", { format: "js" }));
      await assertCrossOriginNotBlocked(() => {
        tc.request.accept = "text/javascript";
        return tc.get("negotiateCrossOrigin");
      });

      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs", { xhr: true }));
      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs", { xhr: true, format: "js" }));
      await assertCrossOriginNotBlocked(() => {
        tc.request.accept = "text/javascript";
        return tc.get("negotiateCrossOrigin", { xhr: true });
      });
    });
  });
});

describe("RequestForgeryProtectionControllerUsingResetSessionTest", () => {
  // BLOCKED: port-action-view-csrf-helper-and-generated-layout-meta-tags
  it.skip("should emit a csrf-param meta tag and a csrf-token meta tag", () => {});
});

describe("RequestForgeryProtectionControllerUsingNullSessionTest", () => {
  it.skip("should allow to set signed cookies", () => {});
  it.skip("should allow to set encrypted cookies", () => {});

  it("should allow reset_session", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new RequestForgeryProtectionControllerUsingNullSession();
    await tc.beforeSetup();
    await tc.post("tryToResetSession");
    tc.assertResponse("ok");
  });
});

describe("CustomAuthenticityParamControllerTest", () => {
  let tc: TestCase;
  let oldLogger: typeof Base.logger;
  let logger: MockLogger;
  let oldRequestForgeryProtectionToken: string | null;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new CustomAuthenticityParamController();
    await tc.beforeSetup();
    oldLogger = Base.logger;
    logger = new MockLogger();
    oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    Base.requestForgeryProtectionToken = SecureRandom.randomBytes(32).toString("base64url");
  });

  afterEach(() => {
    Base.logger = oldLogger;
    Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
  });

  it("should not warn if form authenticity param matches form authenticity token", async () => {
    Base.logger = logger as never;
    const stub = vi
      .spyOn(
        CustomAuthenticityParamController.prototype as unknown as {
          isValidAuthenticityToken(): boolean;
        },
        "isValidAuthenticityToken",
      )
      .mockReturnValue(true);
    try {
      await tc.post("index", { params: { custom_token_name: "foobar" } });
      expect(logger.logged("warn").length).toBe(0);
    } finally {
      stub.mockRestore();
    }
  });

  it("should warn if form authenticity param does not match form authenticity token", async () => {
    Base.logger = logger as never;
    await tc.post("index", { params: { custom_token_name: "bazqux" } });
    expect(logger.logged("warn").length).toBe(1);
  });
});

describe("PerFormTokensControllerTest", () => {
  let tc: TestCase;
  let oldRequestForgeryProtectionToken: string | null;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new PerFormTokensController();
    await tc.beforeSetup();
    oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    Base.requestForgeryProtectionToken = "custom_authenticity_token";
  });

  afterEach(() => {
    Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
  });

  function assertPresenceAndFetchFormCsrfToken(): string {
    const input = tc.response.body.match(/<input[^>]*name="custom_authenticity_token"[^>]*>/);
    expect(input).not.toBeNull();
    const formCsrfToken = input![0].match(/value="([^"]*)"/)?.[1];
    expect(formCsrfToken).not.toBeNull();
    return formCsrfToken!;
  }

  function assertMatchesSessionTokenOnServer(formToken: string, method = "post"): void {
    const actual = rbFSend(tc.controller, "unmaskToken", decodeCsrfToken(formToken));
    const expected = rbFSend(
      tc.controller,
      "perFormCsrfToken",
      null,
      "/per_form_tokens/post_one",
      method,
    );
    expect(actual).toEqual(expected);
  }

  it("per form token is same size as global token", async () => {
    await tc.get("index");

    const expected = RequestForgeryProtection.AUTHENTICITY_TOKEN_LENGTH;
    const actual = (rbFSend(tc.controller, "perFormCsrfToken", null, "/path", "post") as Bytes)
      .length;
    expect(actual).toBe(expected);
  });

  it("accepts token for correct path and method", async () => {
    await tc.get("index");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken);

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("accepts token with path with query params", async () => {
    await tc.get("index");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken);

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    tc.request.env["QUERY_STRING"] = "key=value";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
  });

  it("rejects garbage path", async () => {
    await tc.get("index");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken);

    tc.request.env["PATH_INFO"] = "/foo/bar<";
    const exception = await assertRaises([InvalidAuthenticityToken], {}, () =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    expect(exception.message).toMatch("Can't verify CSRF token authenticity.");
  });

  it("rejects token for incorrect path", async () => {
    await tc.get("index");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken);

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_two";
    await assertRaises([InvalidAuthenticityToken], {}, () =>
      tc.post("postTwo", { params: { custom_authenticity_token: formToken } }),
    );
  });

  it("rejects token for incorrect method", async () => {
    await tc.get("index");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken);

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertRaises([InvalidAuthenticityToken], {}, () =>
      tc.patch("postOne", { params: { custom_authenticity_token: formToken } }),
    );
  });

  it("rejects token for incorrect method button to", async () => {
    await tc.get("buttonTo", { params: { form_method: "delete" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken, "delete");

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertRaises([InvalidAuthenticityToken], {}, () =>
      tc.patch("postOne", { params: { custom_authenticity_token: formToken } }),
    );
  });

  it("Accepts proper token for implicit post method on button_to tag", async () => {
    await tc.get("buttonTo");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken, "post");

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
  });

  for (const verb of ["delete", "post", "patch"] as const) {
    it(`Accepts proper token for ${verb} method on button_to tag`, async () => {
      await tc.get("buttonTo", { params: { form_method: verb } });

      const formToken = assertPresenceAndFetchFormCsrfToken();

      assertMatchesSessionTokenOnServer(formToken, verb);

      tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
      await assertNothingRaised(() =>
        tc[verb]("postOne", { params: { custom_authenticity_token: formToken } }),
      );
    });
  }

  it("accepts global csrf token", async () => {
    await tc.get("index");

    const token = rbFSend(tc.controller, "formAuthenticityToken") as string;

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: token } }),
    );
    tc.assertResponse("success");
  });

  it("does not return old csrf token", async () => {
    await tc.get("index");

    const token = rbFSend(tc.controller, "formAuthenticityToken") as string;

    const unmaskedToken = rbFSend(tc.controller, "unmaskToken", decodeCsrfToken(token));

    expect(unmaskedToken).not.toEqual(rbFSend(tc.controller, "realCsrfToken"));
  });

  it("returns hmacd token", async () => {
    await tc.get("index");

    const token = rbFSend(tc.controller, "formAuthenticityToken") as string;

    const unmaskedToken = rbFSend(tc.controller, "unmaskToken", decodeCsrfToken(token));

    expect(unmaskedToken).toEqual(rbFSend(tc.controller, "globalCsrfToken"));
  });

  it("accepts old csrf token", async () => {
    await tc.get("index");

    const nonHmacToken = rbFSend(
      tc.controller,
      "maskToken",
      rbFSend(tc.controller, "realCsrfToken"),
    );

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: nonHmacToken } }),
    );
    tc.assertResponse("success");
  });

  it("chomps slashes", async () => {
    await tc.get("index", { params: { form_path: "/per_form_tokens/post_one?foo=bar" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    assertMatchesSessionTokenOnServer(formToken);

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one/";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken, baz: "foo" } }),
    );
    tc.assertResponse("success");
  });

  it("ignores trailing slash during generation", async () => {
    await tc.get("index", { params: { form_path: "/per_form_tokens/post_one/" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("handles empty path as request path", async () => {
    await tc.get("index", { params: { form_path: "" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("handles relative paths", async () => {
    await tc.get("index", { params: { form_path: "post_one" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("handles relative paths with dot", async () => {
    await tc.get("index", { params: { form_path: "./post_one" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("handles query string", async () => {
    await tc.get("index", { params: { form_path: "./post_one?a=b" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("handles fragment", async () => {
    await tc.get("index", { params: { form_path: "./post_one#a" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("ignores origin during generation", async () => {
    await tc.get("index", {
      params: { form_path: "https://example.com/per_form_tokens/post_one/" },
    });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("ignores trailing slash during validation", async () => {
    await tc.get("index");

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one/";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });

  it("method is case insensitive", async () => {
    await tc.get("index", { params: { form_method: "POST" } });

    const formToken = assertPresenceAndFetchFormCsrfToken();

    tc.request.env["PATH_INFO"] = "/per_form_tokens/post_one/";
    await assertNothingRaised(() =>
      tc.post("postOne", { params: { custom_authenticity_token: formToken } }),
    );
    tc.assertResponse("success");
  });
});

describe("PrependProtectForgeryBaseControllerTest", () => {
  it.skip("verify authenticity token is prepended", () => {});
  it.skip("verify authenticity token is not prepended", () => {});
  it.skip("verify authenticity token is not prepended by default", () => {});
});

describe("FreeCookieControllerTest", () => {
  it("should allow all methods without token", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new FreeCookieController();
    await tc.beforeSetup();
    for (const method of ["post", "patch", "put", "delete"] as const) {
      await tc[method]("index");
    }
  });
  it.skip("should not render form with token tag", () => {});
  it.skip("should not render button to with token tag", () => {});
  it.skip("should not emit a csrf-token meta tag", () => {});
});

describe("SkipProtectionControllerTest", () => {
  it.skip("should not allow post without token when not skipping", () => {});
  it.skip("should allow post without token when skipping", () => {});
});

describe("SkipProtectionWhenUnprotectedControllerTest", () => {
  it.skip("should allow skip request when protection is not set", () => {});
});

describe("CookieCsrfTokenStorageStrategyControllerTest", () => {
  it.skip("csrf token is stored in cookie", () => {});
  it.skip("csrf token is stored in custom cookie", () => {});
  it.skip("csrf token cookie has same site lax", () => {});
  it.skip("csrf token cookie is http only", () => {});
  it.skip("csrf token cookie is permanent", () => {});
  it.skip("reset csrf token deletes cookie", () => {});
  it.skip("should allow when session id in cookie matches session id", () => {});
  it.skip("should not allow when session id in cookie does not match session id", () => {});
  it.skip("should allow when session id in cookie and session id are nil", () => {});
  it.skip("should not allow when session id in cookie but session id is nil", () => {});
  it.skip("should allow when session id in cookie is nil and session created before token validation", () => {});
  it.skip("should allow when session id in cookie is nil and session reset before token validation", () => {});
  it.skip("should not allow when session id in cookie but request made with no session", () => {});
});

describe("CustomCsrfTokenStorageStrategyControllerTest", () => {
  it.skip("csrf token is stored in custom location", () => {});
});
