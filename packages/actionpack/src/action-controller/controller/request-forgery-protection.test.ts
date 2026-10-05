import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  ActiveSupportJSON,
  Duration,
  assertNothingRaised,
  assertRaises,
  include,
  isBlank,
  type Included,
} from "@blazetrails/activesupport";
import { RotationConfiguration } from "@blazetrails/activesupport/messages/rotation-configuration";
import {
  RoutingUrlFor,
  embedAuthenticityTokenInRemoteForms,
  setEmbedAuthenticityTokenInRemoteForms,
} from "@blazetrails/actionview";
import { SecureRandom, rbFSend, type Bytes } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { TestCase, TestSession } from "../test-case.js";
import {
  CookieStore,
  InvalidAuthenticityToken,
  InvalidCrossOriginRequest,
  RequestForgeryProtection,
  decodeCsrfToken,
} from "../metal/request-forgery-protection.js";
import { UrlFor } from "../../action-dispatch/routing/url-for.js";
import { CookieAssertions } from "../../test-helpers/abstract-unit.js";

include(RoutingUrlFor, UrlFor);

interface ActionsHost {
  sameOriginJs(): Promise<void>;
  negotiateSameOrigin(): Promise<void>;
}

const RequestForgeryProtectionActions = {
  async index(this: Base): Promise<void> {
    await this.render({ inline: "<%= context.formTag('/', {}, () => {}) %>" });
  },

  async showButton(this: Base): Promise<void> {
    await this.render({ inline: "<%= context.buttonTo('New', '/') %>" });
  },

  async unsafe(this: Base): Promise<void> {
    await this.render({ plain: "pwn" });
  },

  async meta(this: Base): Promise<void> {
    await this.render({ inline: "<%= context.csrfMetaTags() %>" });
  },

  async formForRemote(this: Base): Promise<void> {
    await this.render({
      inline: "<%= context.formFor('some_resource', { remote: true }, () => {}) %>",
    });
  },

  async formForRemoteWithToken(this: Base): Promise<void> {
    await this.render({
      inline:
        "<%= context.formFor('some_resource', { remote: true, authenticityToken: true }, () => {}) %>",
    });
  },

  async formForWithToken(this: Base): Promise<void> {
    await this.render({
      inline: "<%= context.formFor('some_resource', { authenticityToken: true }, () => {}) %>",
    });
  },

  async formForRemoteWithExternalToken(this: Base): Promise<void> {
    await this.render({
      inline:
        "<%= context.formFor('some_resource', { remote: true, authenticityToken: 'external_token' }, () => {}) %>",
    });
  },

  async formWithRemote(this: Base): Promise<void> {
    await this.render({
      inline: "<%= context.formWith({ scope: 'some_resource' }, () => {}) %>",
    });
  },

  async formWithRemoteWithToken(this: Base): Promise<void> {
    await this.render({
      inline:
        "<%= context.formWith({ scope: 'some_resource', authenticityToken: true }, () => {}) %>",
    });
  },

  async formWithLocalWithToken(this: Base): Promise<void> {
    await this.render({
      inline:
        "<%= context.formWith({ scope: 'some_resource', local: true, authenticityToken: true }, () => {}) %>",
    });
  },

  async formWithRemoteWithExternalToken(this: Base): Promise<void> {
    await this.render({
      inline:
        "<%= context.formWith({ scope: 'some_resource', authenticityToken: 'external_token' }, () => {}) %>",
    });
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
  async signed(): Promise<void> {
    this.cookies().signed.set("foo", "bar");
    this.head("ok");
  }

  async encrypted(): Promise<void> {
    this.cookies().encrypted.set("foo", "bar");
    this.head("ok");
  }

  async tryToResetSession(): Promise<void> {
    this.resetSession();
    this.head("ok");
  }
}
RequestForgeryProtectionControllerUsingNullSession.protectFromForgery({ with: "null_session" });

class FakeException extends Error {}

class CustomStrategy {
  controller: unknown;

  constructor(controller: unknown) {
    this.controller = controller;
  }

  handleUnverifiedRequest(): void {
    throw new FakeException("Raised a fake exception.");
  }
}

class RequestForgeryProtectionControllerUsingCustomStrategy extends Base {
  static FakeException = FakeException;
  static CustomStrategy = CustomStrategy;
}
include(RequestForgeryProtectionControllerUsingCustomStrategy, RequestForgeryProtectionActions);
RequestForgeryProtectionControllerUsingCustomStrategy.protectFromForgery({
  only: ["index", "meta", "sameOriginJs", "negotiateSameOrigin"],
  with: CustomStrategy,
});

class PrependProtectForgeryBaseController extends Base {
  calledCallbacks?: string[];

  async index(): Promise<void> {
    await this.render({ inline: "OK" });
  }

  /** @internal */
  private addCalledCallback(name: string): void {
    this.calledCallbacks ??= [];
    this.calledCallbacks.push(name);
  }

  /** @internal */
  private customAction(): void {
    this.addCalledCallback("custom_action");
  }

  /** @internal */
  verifyAuthenticityToken(): void {
    this.addCalledCallback("verify_authenticity_token");
  }
}
PrependProtectForgeryBaseController.beforeAction("customAction");

class FreeCookieController extends RequestForgeryProtectionControllerUsingResetSession {
  async index(): Promise<void> {
    await this.render({ inline: "<%= context.formTag('/', {}, () => {}) %>" });
  }

  async showButton(): Promise<void> {
    await this.render({ inline: "<%= context.buttonTo('New', '/') %>" });
  }
}
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

class SkipProtectionController extends Base {
  private _skipRequested?: boolean;

  skipRequested(): boolean | undefined {
    return this._skipRequested;
  }

  setSkipRequested(skipRequested: boolean): void {
    this._skipRequested = skipRequested;
  }
}
include(SkipProtectionController, RequestForgeryProtectionActions);
SkipProtectionController.protectFromForgery({ with: "exception" });
SkipProtectionController.skipForgeryProtection({ if: "skipRequested" });

class SkipProtectionWhenUnprotectedController extends Base {}
include(SkipProtectionWhenUnprotectedController, RequestForgeryProtectionActions);
SkipProtectionWhenUnprotectedController.skipForgeryProtection();

class CookieCsrfTokenStorageStrategyController extends Base {
  async reset(): Promise<void> {
    this.resetCsrfToken(this.request);
    this.head("ok");
  }

  async cookie(): Promise<void> {
    await this.render({ inline: "<%= context.csrfMetaTags() %>" });
  }

  /** @internal */
  private commitToken(): void {
    this.request.commitCsrfToken();
  }
}
include(CookieCsrfTokenStorageStrategyController, RequestForgeryProtectionActions);
CookieCsrfTokenStorageStrategyController.afterAction("commitToken", { only: "cookie" });
CookieCsrfTokenStorageStrategyController.protectFromForgery({
  only: ["index", "meta", "sameOriginJs", "negotiateSameOrigin"],
  with: "exception",
  store: "cookie",
});

class CustomCsrfTokenStorageStrategyController extends Base {
  static CustomStrategy = class CustomStrategy {
    fetch(request: { env: Record<string, unknown> }): string | null {
      return request.env["custom_storage"] as string | null;
    }

    store(request: { env: Record<string, unknown> }, csrfToken: string): void {
      request.env["custom_storage"] = csrfToken;
    }

    reset(request: { env: Record<string, unknown> }): void {
      request.env["custom_storage"] = null;
    }
  };
}
include(CustomCsrfTokenStorageStrategyController, RequestForgeryProtectionActions);
CustomCsrfTokenStorageStrategyController.protectFromForgery({
  only: ["index", "meta", "sameOriginJs", "negotiateSameOrigin"],
  with: "reset_session",
  store: new CustomCsrfTokenStorageStrategyController.CustomStrategy(),
});

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

function RequestForgeryProtectionTests(
  controllerClass: new () => Base,
  assertBlockedOverride?: (block: () => Promise<unknown>) => Promise<unknown>,
  overrides: {
    testCase?: new (name: string) => TestCase;
    setup?: (tc: TestCase) => void;
    initializeCsrfToken?: (tc: TestCase, token: string) => void;
    assertNotBlocked?: (tc: TestCase, block: () => Promise<unknown>) => Promise<void>;
  } = {},
) {
  let tc: TestCase;
  let oldRequestForgeryProtectionToken: string | null;

  beforeEach(async ({ task }) => {
    tc = new (overrides.testCase ?? TestCase)(task.name);
    tc.controller = new controllerClass();
    await tc.beforeSetup();
    overrides.setup?.(tc);
    oldRequestForgeryProtectionToken = Base.requestForgeryProtectionToken;
    Base.requestForgeryProtectionToken = "custom_authenticity_token";
  });

  afterEach(() => {
    Base.requestForgeryProtectionToken = oldRequestForgeryProtectionToken;
  });

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with token tag", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render button to with token tag", () => {});

  it("should render form without token tag if remote", async () => {
    await assertNotBlocked(() => tc.get("formForRemote"));
    expect(tc.response.body).not.toMatch(/authenticity_token/);
  });

  it("should render form with token tag if remote and embedding token is on", async () => {
    const original = embedAuthenticityTokenInRemoteForms;
    try {
      setEmbedAuthenticityTokenInRemoteForms(true);
      await assertNotBlocked(() => tc.get("formForRemote"));
      expect(tc.response.body).toMatch(/authenticity_token/);
    } finally {
      setEmbedAuthenticityTokenInRemoteForms(original);
    }
  });

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with token tag if remote and external authenticity token requested and embedding is on", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with token tag if remote and external authenticity token requested", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with token tag if remote and authenticity token requested", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with token tag with authenticity token requested", () => {});

  it("should render form with with token tag if remote", async () => {
    await assertNotBlocked(() => tc.get("formWithRemote"));
    expect(tc.response.body).toMatch(/authenticity_token/);
  });

  it("should render form with without token tag if remote and embedding token is off", async () => {
    const original = embedAuthenticityTokenInRemoteForms;
    try {
      setEmbedAuthenticityTokenInRemoteForms(false);
      await assertNotBlocked(() => tc.get("formWithRemote"));
      expect(tc.response.body).not.toMatch(/authenticity_token/);
    } finally {
      setEmbedAuthenticityTokenInRemoteForms(original);
    }
  });

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with with token tag if remote and external authenticity token requested and embedding is on", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with with token tag if remote and external authenticity token requested", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with with token tag if remote and authenticity token requested", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with with token tag with authenticity token requested", () => {});

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should render form with with token tag if remote and embedding token is on", () => {});

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
    initializeCsrfToken();
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

  it("csrf token is not saved if it is nil", async () => {
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

  function initializeCsrfToken(token = TOKEN): void {
    if (overrides.initializeCsrfToken) return overrides.initializeCsrfToken(tc, token);
    tc.session().set("_csrf_token", token);
  }

  async function assertBlocked(block: () => Promise<unknown>): Promise<unknown> {
    if (assertBlockedOverride) return assertBlockedOverride(block);
    tc.session().set("something_like_user_id", 1);
    await block();
    expect(
      tc.session().get("something_like_user_id"),
      "session values are still present",
    ).toBeUndefined();
    tc.assertResponse("success");
  }

  async function assertNotBlocked(block: () => Promise<unknown>): Promise<void> {
    if (overrides.assertNotBlocked) return overrides.assertNotBlocked(tc, block);
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

  async function assertCrossOriginBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertRaises([InvalidCrossOriginRequest], {}, block);
  }

  async function assertCrossOriginNotBlocked(block: () => Promise<unknown>): Promise<void> {
    tc.session().set("something_like_user_id", 1);
    await assertNothingRaised(block);
    expect(tc.session().get("something_like_user_id")).toBe(1);
    tc.assertResponse("success");
  }

  return { t: () => tc, initializeCsrfToken, forgeryProtectionOriginCheck };
}

describe("RequestForgeryProtectionControllerUsingResetSessionTest", () => {
  RequestForgeryProtectionTests(RequestForgeryProtectionControllerUsingResetSession);

  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should emit a csrf-param meta tag and a csrf-token meta tag", () => {});
});

describe("RequestForgeryProtectionControllerUsingNullSessionTest", () => {
  class NullSessionDummyKeyGenerator {
    generateKey(_secret: string, _length: number | null = null): string {
      return "03312270731a2ed0d11ed091c2338a06";
    }
  }

  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new RequestForgeryProtectionControllerUsingNullSession();
    await tc.beforeSetup();
    tc.request.env["action_dispatch.key_generator"] = new NullSessionDummyKeyGenerator();
    tc.request.env["action_dispatch.cookies_rotations"] = new RotationConfiguration();
  });

  it("should allow to set signed cookies", async () => {
    await tc.post("signed");
    tc.assertResponse("ok");
  });

  it("should allow to set encrypted cookies", async () => {
    await tc.post("encrypted");
    tc.assertResponse("ok");
  });

  it("should allow reset_session", async () => {
    await tc.post("tryToResetSession");
    tc.assertResponse("ok");
  });
});

describe("RequestForgeryProtectionControllerUsingExceptionTest", () => {
  const { t, initializeCsrfToken, forgeryProtectionOriginCheck } = RequestForgeryProtectionTests(
    RequestForgeryProtectionControllerUsingException,
    (block) => assertRaises([InvalidAuthenticityToken], {}, block),
  );

  it("raised exception message explains why it occurred", async () => {
    await forgeryProtectionOriginCheck(async () => {
      initializeCsrfToken();
      const exception = await assertRaises([InvalidAuthenticityToken], {}, () => {
        t().request.setHeader("HTTP_ORIGIN", "http://bad.host");
        return t().post("index", { params: { custom_authenticity_token: TOKEN } });
      });
      expect(exception.message).toMatch(
        "HTTP Origin header (http://bad.host) didn't match request.base_url (http://test.host)",
      );
    });
  });
});

describe("RequestForgeryProtectionControllerUsingCustomStrategyTest", () => {
  RequestForgeryProtectionTests(RequestForgeryProtectionControllerUsingCustomStrategy, (block) =>
    assertRaises([RequestForgeryProtectionControllerUsingCustomStrategy.FakeException], {}, block),
  );
});

describe("PrependProtectForgeryBaseControllerTest", () => {
  class PrependTrueController extends PrependProtectForgeryBaseController {}
  PrependTrueController.protectFromForgery({ prepend: true });

  class PrependFalseController extends PrependProtectForgeryBaseController {}
  PrependFalseController.protectFromForgery({ prepend: false });

  class PrependDefaultController extends PrependProtectForgeryBaseController {}
  PrependDefaultController.protectFromForgery();

  let tc: TestCase;

  beforeEach(({ task }) => {
    tc = new TestCase(task.name);
  });

  it("verify authenticity token is prepended", async () => {
    const controller = (tc.controller = new PrependTrueController());
    await tc.beforeSetup();
    await tc.get("index");
    const expectedCallbackOrder = ["verify_authenticity_token", "custom_action"];
    expect(controller.calledCallbacks).toEqual(expectedCallbackOrder);
  });

  it("verify authenticity token is not prepended", async () => {
    const controller = (tc.controller = new PrependFalseController());
    await tc.beforeSetup();
    await tc.get("index");
    const expectedCallbackOrder = ["custom_action", "verify_authenticity_token"];
    expect(controller.calledCallbacks).toEqual(expectedCallbackOrder);
  });

  it("verify authenticity token is not prepended by default", async () => {
    const controller = (tc.controller = new PrependDefaultController());
    await tc.beforeSetup();
    await tc.get("index");
    const expectedCallbackOrder = ["custom_action", "verify_authenticity_token"];
    expect(controller.calledCallbacks).toEqual(expectedCallbackOrder);
  });
});

describe("FreeCookieControllerTest", () => {
  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should not render form with token tag", () => {});
  // BLOCKED: action-controller-test-case-has-no-assert-select
  it.skip("should not render button to with token tag", () => {});

  it("should allow all methods without token", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new FreeCookieController();
    await tc.beforeSetup();
    for (const method of ["post", "patch", "put", "delete"] as const) {
      await assertNothingRaised(() => tc[method]("index"));
    }
  });

  it("should not emit a csrf-token meta tag", async ({ task }) => {
    const tc = new TestCase(task.name);
    tc.controller = new FreeCookieController();
    await tc.beforeSetup();
    await tc.get("meta");
    expect(isBlank(tc.response.body)).toBe(true);
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

describe("SkipProtectionControllerTest", () => {
  let tc: TestCase;
  let controller: SkipProtectionController;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    controller = tc.controller = new SkipProtectionController();
    await tc.beforeSetup();
  });

  it("should not allow post without token when not skipping", async () => {
    controller.setSkipRequested(false);
    await assertBlocked(() => tc.post("index"));
  });

  it("should allow post without token when skipping", async () => {
    controller.setSkipRequested(true);
    await assertNotBlocked(() => tc.post("index"));
  });

  async function assertBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertRaises([InvalidAuthenticityToken], {}, block);
  }

  async function assertNotBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertNothingRaised(block);
    tc.assertResponse("success");
  }
});

describe("SkipProtectionWhenUnprotectedControllerTest", () => {
  let tc: TestCase;

  beforeEach(async ({ task }) => {
    tc = new TestCase(task.name);
    tc.controller = new SkipProtectionWhenUnprotectedController();
    await tc.beforeSetup();
  });

  it("should allow skip request when protection is not set", async () => {
    await assertNotBlocked(() => tc.post("index"));
  });

  async function assertNotBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertNothingRaised(block);
    tc.assertResponse("success");
  }
});

describe("CookieCsrfTokenStorageStrategyControllerTest", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include CookieAssertions`
  class CookieCsrfTokenStorageStrategyControllerTest extends TestCase {}
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include CookieAssertions`; the merge is how `include()` types it
  interface CookieCsrfTokenStorageStrategyControllerTest extends Included<
    typeof CookieAssertions
  > {}
  include(CookieCsrfTokenStorageStrategyControllerTest, CookieAssertions);

  class TestSession_ extends TestSession {
    private _idWas: unknown;

    constructor(idWas: unknown) {
      super();
      this._idWas = idWas;
    }

    override idWas(): unknown {
      return this._idWas;
    }
  }

  class NullSessionDummyKeyGenerator {
    generateKey(_secret: string, _length: number | null = null): string {
      return "03312270731a2ed0d11ed091c2338a06";
    }
  }

  const { t } = RequestForgeryProtectionTests(
    CookieCsrfTokenStorageStrategyController,
    (block) => assertRaises([InvalidAuthenticityToken], {}, block),
    {
      testCase: CookieCsrfTokenStorageStrategyControllerTest,
      setup(tc) {
        tc.request.env["action_dispatch.key_generator"] = new NullSessionDummyKeyGenerator();
        tc.request.env["action_dispatch.cookies_rotations"] = new RotationConfiguration();
      },
      initializeCsrfToken: (_tc, token) => initializeCsrfToken(token),
      assertNotBlocked: (_tc, block) => assertNotBlocked(block),
    },
  );
  const tc = () => t() as CookieCsrfTokenStorageStrategyControllerTest;
  const controller = () => tc().controller as CookieCsrfTokenStorageStrategyController;

  async function stubFormAuthenticityToken(block: () => Promise<unknown>): Promise<void> {
    const stub = vi.spyOn(controller(), "formAuthenticityToken").mockReturnValue(TOKEN);
    try {
      await block();
    } finally {
      stub.mockRestore();
    }
  }

  it("csrf token is stored in cookie", async () => {
    await tc().get("cookie");
    expect(tc().session().isKey("_csrf_token")).toBe(false);
    expect(tc().cookies().isKey("csrf_token")).toBe(true);
  });

  it("csrf token is stored in custom cookie", async () => {
    (
      controller() as unknown as { csrfTokenStorageStrategy: CookieStore }
    ).csrfTokenStorageStrategy = new CookieStore("custom_cookie");
    await tc().get("cookie");
    expect(tc().cookies().isKey("csrf_token")).toBe(false);
    expect(tc().cookies().isKey("custom_cookie")).toBe(true);
  });

  it("csrf token cookie has same site lax", async () => {
    await tc().get("cookie");
    tc().assertSetCookieAttributes("csrf_token", "SameSite=Lax");
  });

  it("csrf token cookie is http only", async () => {
    await tc().get("cookie");

    const cookies = tc().parseSetCookiesHeaders(tc().response.headers.get("Set-Cookie"));
    const csrfTokenCookie = cookies.get("csrf_token")!;
    expect(csrfTokenCookie["httponly"]).toBeTruthy();
  });

  it("csrf token cookie is permanent", async () => {
    await tc().get("cookie");
    expect(tc().response.headers.get("Set-Cookie")).toMatch(
      new RegExp(`${Duration.years(20).fromNow().utc().year}`),
    );
  });

  it("reset csrf token deletes cookie", async () => {
    await tc().get("cookie");
    await tc().get("reset");
    expect(tc().cookies().get("csrf_token")).toBeUndefined();
  });

  it("should allow when session id in cookie matches session id", async () => {
    initializeCsrfToken();

    await stubFormAuthenticityToken(() =>
      assertNotBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  it("should not allow when session id in cookie does not match session id", async () => {
    initializeCsrfToken(TOKEN, new TestSession());

    await stubFormAuthenticityToken(() =>
      assertBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  it("should allow when session id in cookie and session id are nil", async () => {
    tc().request.session = new TestSession({}, null as never) as never;
    initializeCsrfToken(TOKEN, null);

    await stubFormAuthenticityToken(() =>
      assertNotBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  it("should not allow when session id in cookie but session id is nil", async () => {
    initializeCsrfToken();
    tc().request.session = new TestSession({}, null as never) as never;

    await stubFormAuthenticityToken(() =>
      assertBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  it("should allow when session id in cookie is nil and session created before token validation", async () => {
    initializeCsrfToken(TOKEN, null);
    tc().request.session = new TestSession_(null) as never;

    await stubFormAuthenticityToken(() =>
      assertNotBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  it("should allow when session id in cookie is nil and session reset before token validation", async () => {
    initializeCsrfToken();
    tc().request.session = new TestSession_(tc().session().id()) as never;

    await stubFormAuthenticityToken(() =>
      assertNotBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  it("should not allow when session id in cookie but request made with no session", async () => {
    initializeCsrfToken();
    tc().request.session = new TestSession_(null) as never;

    await stubFormAuthenticityToken(() =>
      assertBlocked(() => tc().post("index", { params: { custom_authenticity_token: TOKEN } })),
    );
  });

  function initializeCsrfToken(
    token = TOKEN,
    session: { id(): unknown } | null = tc().session(),
  ): void {
    tc()
      .cookies()
      .encrypted.set("csrf_token", {
        value: ActiveSupportJSON.encode({
          token: token,
          session_id: session?.id(),
        }),
        httpOnly: true,
        sameSite: ":lax",
      });
  }

  async function assertBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertRaises([InvalidAuthenticityToken], {}, block);
  }

  async function assertNotBlocked(block: () => Promise<unknown>): Promise<void> {
    await assertNothingRaised(block);
    tc().assertResponse("success");
  }
});

describe("CustomCsrfTokenStorageStrategyControllerTest", () => {
  const { t } = RequestForgeryProtectionTests(CustomCsrfTokenStorageStrategyController, undefined, {
    initializeCsrfToken: (_tc, token) => initializeCsrfToken(token),
  });

  it("csrf token is stored in custom location", async () => {
    await t().post("index");
    (t().controller as Base).commitCsrfToken(t().request);
    expect(t().session().isKey("_csrf_token")).toBe(false);
    expect(t().request.env["custom_storage"]).not.toBeNull();
  });

  function initializeCsrfToken(token = TOKEN): void {
    t().request.env["custom_storage"] = token;
  }
});
