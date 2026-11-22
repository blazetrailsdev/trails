import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { ActionController, Flash, type FlashHash } from "@blazetrails/actionpack";
import { Methods } from "@blazetrails/rack-test";
import {
  FileUtils,
  Marshal,
  hashAref,
  TopLevel,
  constSet,
  include,
} from "@blazetrails/ruby-compat";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface MiddlewareSessionTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class MiddlewareSessionTest extends TestCase {
  app() {
    return Trails.application!;
  }
}
include(MiddlewareSessionTest, Isolation);
include(MiddlewareSessionTest, Methods);
registerSpecType(/^MiddlewareSessionTest$/, MiddlewareSessionTest);

type Host = MiddlewareSessionTest & {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  post(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  lastRequest(): { env: Record<string, unknown> };
  lastResponse(): { status: number; body: string; headers: Record<string, string | undefined> };
};

const routes = (body: string): string => `
  import { Trails } from "@blazetrails/trailties";
  Trails.application!.routes().draw(function () {
    ${body}
  });
`;

const controller = (name: string, body: string, parent = "ApplicationController"): string => `
  import { ApplicationController } from "./application-controller.ts";
  import { ActionController } from "@blazetrails/actionpack";
  import { hashAref, rbInspect } from "@blazetrails/ruby-compat";
  export class ${name} extends ${parent} {
    ${body}
  }
`;

const encryptedSessionController = controller(
  "FooController",
  `
    async writeSession() {
      await this.session.set("foo", 1);
      await this.head(":ok");
    }

    async readSession() {
      await this.render({ plain: await this.session.get("foo") });
    }

    async readEncryptedCookie() {
      await this.render({ plain: hashAref(this.cookies().encrypted.get("_myapp_session") as object, "foo") });
    }

    async readRawCookie() {
      await this.render({ plain: this.cookies().get("_myapp_session") });
    }
  `,
  "ActionController.Base",
);

describe("MiddlewareSessionTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new MiddlewareSessionTest("test") as unknown as Host;
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  const requireEnvironment = async () => import(`${await t.appPath()}/config/environment.ts`);

  it("config.force_ssl sets cookie to secure only by default", async () => {
    await t.addToConfig("this.config.forceSsl = true;");
    await requireEnvironment();
    expect(t.app().config.sessionOptions["secure"]).toBeTruthy();
  });

  it("config.force_ssl doesn't set cookie to secure only when changed from default", async () => {
    await t.addToConfig("this.config.forceSsl = true;");
    await t.addToConfig("this.config.sslOptions = { secureCookies: false };");
    await requireEnvironment();
    expect(t.app().config.sessionOptions["secure"]).toBeFalsy();
  });

  it("session is not loaded if it's not used", async () => {
    await t.makeBasicApp();

    class OmgController extends ActionController.Base {
      async index(): Promise<void> {
        if (this.params.get("flash") != null) {
          (await (this as unknown as { flash: Promise<FlashHash> }).flash).set("notice", "notice");
        }

        await this.head(":ok");
      }
    }
    constSet(TopLevel, "OmgController", OmgController);

    await t.get("/?flash=true");
    await t.get("/");

    expect(t.lastRequest().env["HTTP_COOKIE"]).toBeTruthy();
    expect(t.lastResponse().headers["set-cookie"]).toBeFalsy();
  });

  it("session is empty and isn't saved on unverified request when using :null_session protect method", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get(":controller(/:action)");
        this.post(":controller(/:action)");
      `),
    );

    await t.controller(
      "foo",
      controller(
        "FooController",
        `
          static {
            this.protectFromForgery({ with: "null_session" });
          }

          async writeSession() {
            await this.session.set("foo", 1);
            await this.head(":ok");
          }

          async readSession() {
            await this.render({ plain: rbInspect(await this.session.get("foo")) });
          }
        `,
        "ActionController.Base",
      ),
    );

    await t.addToConfig(`
        this.config.actionController.allowForgeryProtection = true;
`);

    await requireEnvironment();

    await t.get("/foo/writeSession");
    await t.get("/foo/readSession");
    expect(t.lastResponse().body).toBe("1");

    await t.post("/foo/readSession");
    expect(t.lastResponse().body).toBe("nil");

    await t.post("/foo/writeSession");
    await t.get("/foo/readSession");
    expect(t.lastResponse().body).toBe("1");
  });

  it("cookie jar is empty and isn't saved on unverified request when using :null_session protect method", async () => {
    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get(":controller(/:action)");
        this.post(":controller(/:action)");
      `),
    );

    await t.controller(
      "foo",
      controller(
        "FooController",
        `
          static {
            this.protectFromForgery({ with: "null_session" });
          }

          async writeCookie() {
            this.cookies().set("foo", "1");
            await this.head(":ok");
          }

          async readCookie() {
            await this.render({ plain: rbInspect(this.cookies().get("foo")) });
          }
        `,
        "ActionController.Base",
      ),
    );

    await t.addToConfig(`
        this.config.actionController.allowForgeryProtection = true;
`);

    await requireEnvironment();

    await t.get("/foo/writeCookie");
    await t.get("/foo/readCookie");
    expect(t.lastResponse().body).toBe('"1"');

    await t.post("/foo/readCookie");
    expect(t.lastResponse().body).toBe("nil");

    await t.post("/foo/writeCookie");
    await t.get("/foo/readCookie");
    expect(t.lastResponse().body).toBe('"1"');
  });

  it("session using encrypted cookie store with JSON serializer", async () => {
    await t.appFile("config/routes.ts", routes(`this.get(":controller(/:action)");`));

    await t.controller("foo", encryptedSessionController);

    await t.addToConfig(`
        // Enable AEAD cookies
        this.config.actionDispatch.useAuthenticatedCookieEncryption = true;

        this.config.actionDispatch.cookiesSerializer = ":json";
`);

    await requireEnvironment();

    await t.get("/foo/writeSession");
    await t.get("/foo/readSession");
    expect(t.lastResponse().body).toBe("1");

    await t.get("/foo/readEncryptedCookie");
    expect(t.lastResponse().body).toBe("1");

    const cipher = "aes-256-gcm";
    const secret = t.app().keyGenerator().generateKey("authenticated encrypted cookie");
    const encryptor = new MessageEncryptor(
      secret.subarray(0, MessageEncryptor.keyLen(cipher)),
      null,
      { cipher },
    );

    await t.get("/foo/readRawCookie");
    expect(
      hashAref(
        encryptor.decryptAndVerify(t.lastResponse().body, {
          purpose: "cookie._myapp_session",
        }) as object,
        "foo",
      ),
    ).toBe(1);
  });

  it("session using encrypted cookie store with marshal serializer", async () => {
    await t.appFile("config/routes.ts", routes(`this.get(":controller(/:action)");`));

    await t.controller("foo", encryptedSessionController);

    await t.addToConfig(`
        // Enable AEAD cookies
        this.config.actionDispatch.useAuthenticatedCookieEncryption = true;

        this.config.actionDispatch.cookiesSerializer = ":marshal";
`);

    await requireEnvironment();

    await t.get("/foo/writeSession");
    await t.get("/foo/readSession");
    expect(t.lastResponse().body).toBe("1");

    await t.get("/foo/readEncryptedCookie");
    expect(t.lastResponse().body).toBe("1");

    const cipher = "aes-256-gcm";
    const secret = t.app().keyGenerator().generateKey("authenticated encrypted cookie");
    const encryptor = new MessageEncryptor(
      secret.subarray(0, MessageEncryptor.keyLen(cipher)),
      null,
      { cipher, serializer: Marshal },
    );

    await t.get("/foo/readRawCookie");
    expect(
      hashAref(
        encryptor.decryptAndVerify(t.lastResponse().body, {
          purpose: "cookie._myapp_session",
        }) as object,
        "foo",
      ),
    ).toBe(1);
  });

  it("session upgrading signature to encryption cookie store works the same way as encrypted cookie store", async () => {
    await t.appFile("config/routes.ts", routes(`this.get(":controller(/:action)");`));

    await t.controller("foo", encryptedSessionController);

    await t.addToConfig(`
        // Enable AEAD cookies
        this.config.actionDispatch.useAuthenticatedCookieEncryption = true;
        this.config.actionDispatch.cookiesSerializer = ":marshal";
`);

    await requireEnvironment();

    await t.get("/foo/writeSession");
    await t.get("/foo/readSession");
    expect(t.lastResponse().body).toBe("1");

    await t.get("/foo/readEncryptedCookie");
    expect(t.lastResponse().body).toBe("1");

    const cipher = "aes-256-gcm";
    const secret = t.app().keyGenerator().generateKey("authenticated encrypted cookie");
    const encryptor = new MessageEncryptor(
      secret.subarray(0, MessageEncryptor.keyLen(cipher)),
      null,
      { cipher, serializer: Marshal },
    );

    await t.get("/foo/readRawCookie");
    expect(
      hashAref(
        encryptor.decryptAndVerify(t.lastResponse().body, {
          purpose: "cookie._myapp_session",
        }) as object,
        "foo",
      ),
    ).toBe(1);
  });

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (A Marshal blob written by Ruby): the fixture cookie is a Ruby Marshal dump.
  it.skip("session upgrading from AES-CBC-HMAC encryption to AES-GCM encryption", async () => {
    await t.appFile("config/routes.ts", routes(`this.get(":controller(/:action)");`));

    await t.controller(
      "foo",
      controller(
        "FooController",
        `
          async writeRawSession() {
            // AES-256-CBC with SHA1 HMAC & SHA1 key derivation
            // {"session_id"=>"1965d95720fffc123941bdfb7d2e6870", "foo"=>1}
            this.cookies().set("_myapp_session", "TlgrdS85aUpDd1R2cDlPWlR6K0FJeGExckwySjZ2Z0pkR3d2QnRObGxZT25aalJWYWVvbFVLcHF4d0VQVDdSaFF2QjFPbG9MVjJzeWp3YjcyRUlKUUU2ZlR4bXlSNG9ZUkJPRUtld0E3dVU9LS0xNDZXbGpRZ3NjdW43N2haUEZJSUNRPT0=--3639b5ce54c09495cfeaae928cd5634e0c4b2e96");
            await this.head(":ok");
          }

          async writeSession() {
            await this.session.set("foo", ((await this.session.get("foo")) as number) + 1);
            await this.head(":ok");
          }

          async readSession() {
            await this.render({ plain: await this.session.get("foo") });
          }

          async readEncryptedCookie() {
            await this.render({ plain: hashAref(this.cookies().encrypted.get("_myapp_session") as object, "foo") });
          }

          async readRawCookie() {
            await this.render({ plain: this.cookies().get("_myapp_session") });
          }
        `,
        "ActionController.Base",
      ),
    );

    await t.addToConfig(`
        // Use a static key
        Trails.application!.credentials.secretKeyBase = "known key base";

        // Enable AEAD cookies
        this.config.actionDispatch.useAuthenticatedCookieEncryption = true;

        // Use SHA1 key derivation
        this.config.activeSupport.keyGeneratorHashDigestClass = OpenSSL.Digest.SHA1;

        this.config.actionDispatch.cookiesSerializer = ":marshal";
`);

    const oldTrailsEnv = ENV["TRAILS_ENV"];
    setEnv("TRAILS_ENV", "production");
    try {
      await requireEnvironment();

      await t.get("/foo/writeRawSession");
      await t.get("/foo/readSession");
      expect(t.lastResponse().body).toBe("1");

      await t.get("/foo/writeSession");
      await t.get("/foo/readSession");
      expect(t.lastResponse().body).toBe("2");

      await t.get("/foo/readEncryptedCookie");
      expect(t.lastResponse().body).toBe("2");

      const cipher = "aes-256-gcm";
      const secret = t.app().keyGenerator().generateKey("authenticated encrypted cookie");
      const encryptor = new MessageEncryptor(
        secret.subarray(0, MessageEncryptor.keyLen(cipher)),
        null,
        { cipher, serializer: Marshal },
      );

      await t.get("/foo/readRawCookie");
      expect(
        hashAref(
          encryptor.decryptAndVerify(t.lastResponse().body, {
            purpose: "cookie._myapp_session",
          }) as object,
          "foo",
        ),
      ).toBe(2);
    } finally {
      setEnv("TRAILS_ENV", oldTrailsEnv);
    }
  });

  it("calling reset_session on request does not trigger an error for API apps", async () => {
    await t.addToConfig("this.config.apiOnly = true;");

    await t.controller(
      "test",
      controller(
        "TestController",
        `
          async dumpFlash() {
            await this.request.resetSession();
            await this.render({ plain: "It worked!" });
          }
        `,
      ),
    );

    await t.appFile("config/routes.ts", routes(`this.get({ "/dump_flash": "test#dumpFlash" });`));

    await requireEnvironment();

    await t.get("/dump_flash");

    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toBe("It worked!");

    expect(Trails.application!.middleware.includes(Flash)).toBe(false);
  });

  it("disabled session allows reads and delete but fail on writes", async () => {
    await t.addToConfig(`this.config.sessionStore(":disabled");`);

    await t.controller(
      "test",
      controller(
        "TestController",
        `
          async writeSession() {
            await this.request.session.set("foo", "bar");
            await this.render({ plain: "This shouldn't work" });
          }

          async readSession() {
            await this.render({ plain: rbInspect(await this.request.session.get("foo")) });
          }

          async resetSession() {
            await this.request.resetSession();
            await this.render({ plain: "It worked!" });
          }
        `,
      ),
    );

    await t.appFile(
      "config/routes.ts",
      routes(`
        this.get({ "/write_session": "test#writeSession" });
        this.get({ "/read_session": "test#readSession" });
        this.get({ "/reset_session": "test#resetSession" });
      `),
    );

    await requireEnvironment();

    await t.get("/write_session");
    expect(t.lastResponse().status).toBe(500);

    await t.get("/read_session");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toBe("nil");

    await t.get("/reset_session");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toBe("It worked!");
  });

  it("cookie_only is set to true even if user tries to overwrite it", async () => {
    await t.addToConfig(
      `this.config.sessionStore(":cookie_store", { key: "_myapp_session", cookieOnly: false });`,
    );
    await requireEnvironment();
    expect(t.app().config.sessionOptions["cookieOnly"]).toBeTruthy();
  });

  it("session uses default options if previous sessions exist", async () => {
    await t.addToConfig(`
        const { Duration } = await import("@blazetrails/activesupport");
        const { Cookies } = await import("@blazetrails/actionpack");
        const { DatabaseSelectorResolver, DatabaseSelectorSession } = await import("@blazetrails/activerecord");
        Application.config.apiOnly = true;
        Application.config.sessionStore(":cookie_store", { key: "_random_key" });
        Application.config.middleware.use(Cookies);
        Application.config.middleware.use(Application.config.sessionStore(), Application.config.sessionOptions);
        Application.config.activeRecord.databaseSelector = { delay: Duration.seconds(2) };
        Application.config.activeRecord.databaseResolver = DatabaseSelectorResolver;
        Application.config.activeRecord.databaseResolverContext = DatabaseSelectorSession;
`);
    await t.controller(
      "test",
      controller(
        "TestController",
        `
          async testAction() {
            await this.head(":ok");
          }
        `,
      ),
    );

    await t.appFile("config/routes.ts", routes(`this.get({ "/test_action": "test#testAction" });`));

    await requireEnvironment();

    await t.get("/test_action");
    expect(t.lastResponse().status).toBe(200);
  });
});
