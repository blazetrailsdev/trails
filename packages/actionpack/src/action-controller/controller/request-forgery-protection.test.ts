import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { assertNothingRaised, assertRaises, include } from "@blazetrails/activesupport";
import { SecureRandom } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import {
  InvalidAuthenticityToken,
  InvalidCrossOriginRequest,
} from "../metal/request-forgery-protection.js";

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

  beforeEach(() => {
    tc = new TestCase(RequestForgeryProtectionControllerUsingResetSession);
    oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    Base.requestForgeryProtectionToken = "custom_authenticity_token";
  });

  afterEach(() => {
    Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
  });

  function initializeCsrfToken(token = TOKEN): void {
    tc.session["_csrf_token"] = token;
  }

  async function assertBlocked(block: () => Promise<void>): Promise<void> {
    tc.session["something_like_user_id"] = 1;
    await block();
    expect(
      tc.session["something_like_user_id"],
      "session values are still present",
    ).toBeUndefined();
    tc.assertResponse("success");
  }

  async function assertNotBlocked(block: () => Promise<void>): Promise<void> {
    tc.session["something_like_user_id"] = 1;
    await assertNothingRaised(block);
    expect(tc.session["something_like_user_id"]).toBe(1);
    tc.assertResponse("success");
  }

  async function forgeryProtectionOriginCheck(block: () => Promise<void>): Promise<void> {
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
    await assertNotBlocked(() => tc.post("index", { env: { HTTP_X_CSRF_TOKEN: TOKEN } }));
  });

  it("should allow delete with token in header", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() => tc.delete("index", { env: { HTTP_X_CSRF_TOKEN: TOKEN } }));
  });

  it("should allow patch with token in header", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() => tc.patch("index", { env: { HTTP_X_CSRF_TOKEN: TOKEN } }));
  });

  it("should allow put with token in header", async () => {
    initializeCsrfToken();
    await assertNotBlocked(() => tc.put("index", { env: { HTTP_X_CSRF_TOKEN: TOKEN } }));
  });

  it("should allow post with origin checking and correct origin", async () => {
    await forgeryProtectionOriginCheck(async () => {
      initializeCsrfToken();
      await assertNotBlocked(() =>
        tc.post("index", {
          env: { HTTP_ORIGIN: "http://test.host" },
          params: { custom_authenticity_token: TOKEN },
        }),
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
      const exception = await assertRaises([InvalidAuthenticityToken], {}, () =>
        tc.post("index", {
          env: { HTTP_ORIGIN: "null" },
          params: { custom_authenticity_token: TOKEN },
        }),
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
        await assertBlocked(() =>
          tc.post("index", {
            env: { HTTP_ORIGIN: "http://bad.host" },
            params: { custom_authenticity_token: TOKEN },
          }),
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
    expect(tc.session["_csrf_token"]).toBeUndefined();
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
  it("raised exception message explains why it occurred", async () => {
    const tc = new TestCase(RequestForgeryProtectionControllerUsingException);
    const oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    const oldSetting = Base.forgeryProtectionOriginCheck;
    Base.requestForgeryProtectionToken = "custom_authenticity_token";
    Base.forgeryProtectionOriginCheck = true;
    try {
      tc.session["_csrf_token"] = TOKEN;
      const exception = await assertRaises([InvalidAuthenticityToken], {}, () =>
        tc.post("index", {
          env: { HTTP_ORIGIN: "http://bad.host" },
          params: { custom_authenticity_token: TOKEN },
        }),
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

    beforeEach(() => {
      tc = new TestCase(RequestForgeryProtectionControllerUsingException);
      oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
      Base.requestForgeryProtectionToken = "custom_authenticity_token";
    });

    afterEach(() => {
      Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
    });

    async function assertCrossOriginBlocked(block: () => Promise<void>): Promise<void> {
      await assertRaises([InvalidCrossOriginRequest], {}, block);
    }

    async function assertCrossOriginNotBlocked(block: () => Promise<void>): Promise<void> {
      tc.session["something_like_user_id"] = 1;
      await assertNothingRaised(block);
      expect(tc.session["something_like_user_id"]).toBe(1);
      tc.assertResponse("success");
    }

    const accept = (value: string) => ({ headers: { Accept: value } });

    it("should only allow same origin js get with xhr header", async () => {
      await assertCrossOriginBlocked(() => tc.get("sameOriginJs"));
      await assertCrossOriginBlocked(() => tc.get("sameOriginJs", { format: "js" }));
      await assertCrossOriginBlocked(() =>
        tc.get("negotiateSameOrigin", accept("text/javascript")),
      );

      await assertCrossOriginBlocked(() =>
        tc.get("negotiateSameOrigin", accept("application/javascript")),
      );

      await assertCrossOriginNotBlocked(() => tc.get("sameOriginJs", { xhr: true }));
      await assertCrossOriginNotBlocked(() => tc.get("sameOriginJs", { xhr: true, format: "js" }));
      await assertCrossOriginNotBlocked(() =>
        tc.get("negotiateSameOrigin", { ...accept("text/javascript"), xhr: true }),
      );
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
      tc.session["_csrf_token"] = TOKEN;
      await assertCrossOriginNotBlocked(() =>
        tc.post("sameOriginJs", { params: { custom_authenticity_token: TOKEN } }),
      );
      await assertCrossOriginNotBlocked(() =>
        tc.post("sameOriginJs", { params: { format: "js", custom_authenticity_token: TOKEN } }),
      );
      await assertCrossOriginNotBlocked(() =>
        tc.post("negotiateSameOrigin", {
          ...accept("text/javascript"),
          params: { custom_authenticity_token: TOKEN },
        }),
      );
    });

    it("should only allow cross origin js get without xhr header if protection disabled", async () => {
      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs"));
      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs", { format: "js" }));
      await assertCrossOriginNotBlocked(() =>
        tc.get("negotiateCrossOrigin", accept("text/javascript")),
      );

      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs", { xhr: true }));
      await assertCrossOriginNotBlocked(() => tc.get("crossOriginJs", { xhr: true, format: "js" }));
      await assertCrossOriginNotBlocked(() =>
        tc.get("negotiateCrossOrigin", { ...accept("text/javascript"), xhr: true }),
      );
    });
  });
});

describe("RequestForgeryProtectionControllerUsingResetSessionTest", () => {
  it.skip("should emit a csrf-param meta tag and a csrf-token meta tag", () => {});
});

describe("RequestForgeryProtectionControllerUsingNullSessionTest", () => {
  it.skip("should allow to set signed cookies", () => {});
  it.skip("should allow to set encrypted cookies", () => {});

  it("should allow reset_session", async () => {
    const tc = new TestCase(RequestForgeryProtectionControllerUsingNullSession);
    await tc.post("tryToResetSession");
    tc.assertResponse("ok");
  });
});

describe("CustomAuthenticityParamControllerTest", () => {
  let tc: TestCase;
  let oldLogger: typeof Base.logger;
  let logger: MockLogger;
  let oldRequestForgeryProtectionToken: string | null;

  beforeEach(() => {
    tc = new TestCase(CustomAuthenticityParamController);
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
  it.skip("per form token is same size as global token", () => {});
  it.skip("accepts token for correct path and method", () => {});
  it.skip("accepts token with path with query params", () => {});
  it.skip("rejects token for incorrect path", () => {});
  it.skip("rejects token for incorrect method", () => {});
  it.skip("accepts global csrf token", () => {});
  it.skip("returns hmacd token", () => {});
  it.skip("chomps slashes", () => {});
  it.skip("ignores trailing slash during generation", () => {});
  it.skip("handles empty path as request path", () => {});
  it.skip("handles query string", () => {});
  it.skip("handles fragment", () => {});
  it.skip("ignores trailing slash during validation", () => {});
  it.skip("method is case insensitive", () => {});
  it.skip("rejects garbage path", () => {});
  it.skip("rejects token for incorrect method button to", () => {});
  it.skip("Accepts proper token for implicit post method on button_to tag", () => {});
  it.skip("Accepts proper token for delete method on button_to tag", () => {});
  it.skip("Accepts proper token for post method on button_to tag", () => {});
  it.skip("Accepts proper token for patch method on button_to tag", () => {});
  it.skip("does not return old csrf token", () => {});
  it.skip("accepts old csrf token", () => {});
  it.skip("handles relative paths", () => {});
  it.skip("handles relative paths with dot", () => {});
  it.skip("ignores origin during generation", () => {});
  it.skip("ignores origin during generation with protocol-relative url", () => {});
});

describe("PrependProtectForgeryBaseControllerTest", () => {
  it.skip("verify authenticity token is prepended", () => {});
  it.skip("verify authenticity token is not prepended", () => {});
  it.skip("verify authenticity token is not prepended by default", () => {});
});

describe("FreeCookieControllerTest", () => {
  it("should allow all methods without token", async () => {
    const tc = new TestCase(FreeCookieController);
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
