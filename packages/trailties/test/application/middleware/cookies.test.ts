import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { JSON, Marshal } from "@blazetrails/ruby-compat";
import { CookieJar } from "@blazetrails/actionpack";
import { Methods } from "@blazetrails/rack-test";
import {
  File,
  FileUtils,
  include,
  rbInspect,
  rbModRemoveConst,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Application } from "../../../lib/application.js";
import { Trails } from "../../../lib/trails.js";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface CookiesTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CookiesTest extends TestCase {
  declare get: (path: string) => Promise<unknown>;
  declare lastResponse: () => { body: string };

  async newApp(): Promise<string> {
    return File.expandPath(`${await this.appPath()}/../new_app`);
  }

  app() {
    return Trails.application;
  }
}
include(CookiesTest, Isolation);
include(CookiesTest, Methods);
registerSpecType(/^CookiesTest$/, CookiesTest);

describe("CookiesTest", { timeout: 120_000 }, () => {
  let t: CookiesTest;
  let originalEnv: string;

  beforeEach(async () => {
    originalEnv = String(Trails.env);
    t = new CookiesTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(async () => {
    await t.teardownApp();
    if (await File.isDirectoryAsync(await t.newApp())) await FileUtils.rmRfAsync(await t.newApp());
    Trails.env = originalEnv;
    for (const name of ["TestVerifiers", "TestEncryptors"]) {
      if (Object.hasOwn(TopLevel, name)) rbModRemoveConst(TopLevel, name);
    }
    Trails.application = null;
    Application.appClass = null;
  });

  it("always_write_cookie is true by default in development", async () => {
    Trails.env = "development";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect(CookieJar.alwaysWriteCookie).toBe(true);
  });

  it("always_write_cookie is false by default in production", async () => {
    Trails.env = "production";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect(CookieJar.alwaysWriteCookie).toBe(false);
  });

  it("always_write_cookie can be overridden", async () => {
    await t.addToConfig(`
        this.config.actionDispatch.alwaysWriteCookie = false;
`);

    Trails.env = "development";
    await import(`${await t.appPath()}/config/environment.ts`);
    expect(CookieJar.alwaysWriteCookie).toBe(false);
  });
  it("signed cookies with SHA512 digest and marshal serializer and rotated out SHA256 and SHA1 digests", async () => {
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get(":controller(/:action)");
          this.post(":controller(/:action)");
        });
`,
    );

    await t.controller(
      "foo",
      `
        import { ActionController } from "@blazetrails/actionpack";
        import { TopLevel, rbInspect } from "@blazetrails/ruby-compat";
        export class FooController extends ActionController.Base {
          static {
            this.protectFromForgery({ with: "null_session" });
          }

          async writeRawCookieSha1() {
            this.cookies().set("signed_cookie", TopLevel.TestVerifiers.sha1.generate("signed cookie"));
            await this.head("ok");
          }

          async writeRawCookieSha256() {
            this.cookies().set("signed_cookie", TopLevel.TestVerifiers.sha256.generate("signed cookie"));
            await this.head("ok");
          }

          async readSigned() {
            await this.render({ plain: rbInspect(this.cookies().signed.get("signed_cookie")) });
          }

          async readRawCookie() {
            await this.render({ plain: this.cookies().get("signed_cookie") });
          }
        }
`,
    );

    await t.addToConfig(`
        const { classAttribute } = await import("@blazetrails/activesupport");
        const { MessageVerifier } = await import("@blazetrails/activesupport/message-verifier");
        const { Marshal, TopLevel, constSet } = await import("@blazetrails/ruby-compat");
        const { Trails } = await import("@blazetrails/trailties");
        const sha1Secret = Trails.application!.keyGenerator().generateKey("sha1");
        const sha256Secret = Trails.application!.keyGenerator().generateKey("sha256");

        constSet(TopLevel, "TestVerifiers", class {
          static {
            classAttribute.call(this, "sha1", { default: new MessageVerifier(sha1Secret, { digest: "SHA1", serializer: Marshal }) });
            classAttribute.call(this, "sha256", { default: new MessageVerifier(sha256Secret, { digest: "SHA256", serializer: Marshal }) });
          }
        });

        const config = Trails.application!.config;
        config.actionDispatch.signedCookieDigest = "SHA512";
        config.actionDispatch.signedCookieSalt = "sha512 salt";
        config.actionDispatch.cookiesSerializer = ":marshal";

        const cookies = config.actionDispatch.cookiesRotations;
        cookies.rotate("signed", sha1Secret, { digest: "SHA1" });
        cookies.rotate("signed", sha256Secret, { digest: "SHA256" });
`);

    await import(`${await t.appPath()}/config/environment.ts`);

    const verifierSha512 = new MessageVerifier(t.app()!.keyGenerator().generateKey("sha512 salt"), {
      digest: "SHA512",
      serializer: Marshal,
    });

    await t.get("/foo/writeRawCookieSha1");
    await t.get("/foo/readSigned");
    expect(t.lastResponse().body).toBe(rbInspect("signed cookie"));

    await t.get("/foo/readRawCookie");
    expect(verifierSha512.verify(t.lastResponse().body, { purpose: "cookie.signed_cookie" })).toBe(
      "signed cookie",
    );

    await t.get("/foo/writeRawCookieSha256");
    await t.get("/foo/readSigned");
    expect(t.lastResponse().body).toBe(rbInspect("signed cookie"));

    await t.get("/foo/readRawCookie");
    expect(verifierSha512.verify(t.lastResponse().body, { purpose: "cookie.signed_cookie" })).toBe(
      "signed cookie",
    );
  });

  it("signed cookies with SHA512 digest and JSON serializer and rotated out SHA256 and SHA1 digests", async () => {
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get(":controller(/:action)");
          this.post(":controller(/:action)");
        });
`,
    );

    await t.controller(
      "foo",
      `
        import { ActionController } from "@blazetrails/actionpack";
        import { TopLevel, rbInspect } from "@blazetrails/ruby-compat";
        export class FooController extends ActionController.Base {
          static {
            this.protectFromForgery({ with: "null_session" });
          }

          async writeRawCookieSha1() {
            this.cookies().set("signed_cookie", TopLevel.TestVerifiers.sha1.generate("signed cookie"));
            await this.head("ok");
          }

          async writeRawCookieSha256() {
            this.cookies().set("signed_cookie", TopLevel.TestVerifiers.sha256.generate("signed cookie"));
            await this.head("ok");
          }

          async readSigned() {
            await this.render({ plain: rbInspect(this.cookies().signed.get("signed_cookie")) });
          }

          async readRawCookie() {
            await this.render({ plain: this.cookies().get("signed_cookie") });
          }
        }
`,
    );

    await t.addToConfig(`
        const { classAttribute } = await import("@blazetrails/activesupport");
        const { MessageVerifier } = await import("@blazetrails/activesupport/message-verifier");
        const { JSON, TopLevel, constSet } = await import("@blazetrails/ruby-compat");
        const { Trails } = await import("@blazetrails/trailties");
        const sha1Secret = Trails.application!.keyGenerator().generateKey("sha1");
        const sha256Secret = Trails.application!.keyGenerator().generateKey("sha256");

        constSet(TopLevel, "TestVerifiers", class {
          static {
            classAttribute.call(this, "sha1", { default: new MessageVerifier(sha1Secret, { digest: "SHA1", serializer: JSON }) });
            classAttribute.call(this, "sha256", { default: new MessageVerifier(sha256Secret, { digest: "SHA256", serializer: JSON }) });
          }
        });

        const config = Trails.application!.config;
        config.actionDispatch.signedCookieDigest = "SHA512";
        config.actionDispatch.signedCookieSalt = "sha512 salt";
        config.actionDispatch.cookiesSerializer = ":json";

        const cookies = config.actionDispatch.cookiesRotations;
        cookies.rotate("signed", sha1Secret, { digest: "SHA1" });
        cookies.rotate("signed", sha256Secret, { digest: "SHA256" });
`);

    await import(`${await t.appPath()}/config/environment.ts`);

    const verifierSha512 = new MessageVerifier(t.app()!.keyGenerator().generateKey("sha512 salt"), {
      digest: "SHA512",
      serializer: JSON,
    });

    await t.get("/foo/writeRawCookieSha1");
    await t.get("/foo/readSigned");
    expect(t.lastResponse().body).toBe(rbInspect("signed cookie"));

    await t.get("/foo/readRawCookie");
    expect(verifierSha512.verify(t.lastResponse().body, { purpose: "cookie.signed_cookie" })).toBe(
      "signed cookie",
    );

    await t.get("/foo/writeRawCookieSha256");
    await t.get("/foo/readSigned");
    expect(t.lastResponse().body).toBe(rbInspect("signed cookie"));

    await t.get("/foo/readRawCookie");
    expect(verifierSha512.verify(t.lastResponse().body, { purpose: "cookie.signed_cookie" })).toBe(
      "signed cookie",
    );
  });
  it("encrypted cookies rotating multiple encryption keys", async () => {
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get(":controller(/:action)");
          this.post(":controller(/:action)");
        });
`,
    );

    await t.controller(
      "foo",
      `
        import { ActionController } from "@blazetrails/actionpack";
        import { TopLevel, rbInspect } from "@blazetrails/ruby-compat";
        export class FooController extends ActionController.Base {
          static {
            this.protectFromForgery({ with: "null_session" });
          }

          async writeRawCookieOne() {
            this.cookies().set("encrypted_cookie", TopLevel.TestEncryptors.firstGcm.encryptAndSign("encrypted cookie"));
            await this.head("ok");
          }

          async writeRawCookieTwo() {
            this.cookies().set("encrypted_cookie", TopLevel.TestEncryptors.secondGcm.encryptAndSign("encrypted cookie"));
            await this.head("ok");
          }

          async readEncrypted() {
            await this.render({ plain: rbInspect(this.cookies().encrypted.get("encrypted_cookie")) });
          }

          async readRawCookie() {
            await this.render({ plain: this.cookies().get("encrypted_cookie") });
          }
        }
`,
    );

    await t.addToConfig(`
        const { classAttribute, ActiveSupportJSON } = await import("@blazetrails/activesupport");
        const { MessageEncryptor } = await import("@blazetrails/activesupport/message-encryptor");
        const { Marshal, TopLevel, constSet } = await import("@blazetrails/ruby-compat");
        const { Trails } = await import("@blazetrails/trailties");
        const firstSecret = Trails.application!.keyGenerator().generateKey("first", 32);
        const secondSecret = Trails.application!.keyGenerator().generateKey("second", 32);

        constSet(TopLevel, "TestEncryptors", class {
          static {
            classAttribute.call(this, "firstGcm", { default: new MessageEncryptor(firstSecret, undefined, { cipher: "aes-256-gcm", serializer: Marshal }) });
            classAttribute.call(this, "secondGcm", { default: new MessageEncryptor(secondSecret, undefined, { cipher: "aes-256-gcm", serializer: Marshal }) });
          }
        });

        const config = Trails.application!.config;
        config.actionDispatch.useAuthenticatedCookieEncryption = true;
        config.actionDispatch.encryptedCookieCipher = "aes-256-gcm";
        config.actionDispatch.authenticatedEncryptedCookieSalt = "salt";
        config.actionDispatch.cookiesSerializer = ":marshal";

        const cookies = config.actionDispatch.cookiesRotations;
        cookies.rotate("encrypted", firstSecret);
        cookies.rotate("encrypted", secondSecret);
`);

    await import(`${await t.appPath()}/config/environment.ts`);

    const encryptor = new MessageEncryptor(
      t.app()!.keyGenerator().generateKey("salt", 32),
      undefined,
      {
        cipher: "aes-256-gcm",
        serializer: Marshal,
      },
    );

    await t.get("/foo/writeRawCookieOne");
    await t.get("/foo/readEncrypted");
    expect(t.lastResponse().body).toBe(rbInspect("encrypted cookie"));

    await t.get("/foo/readRawCookie");
    expect(
      encryptor.decryptAndVerify(t.lastResponse().body, { purpose: "cookie.encrypted_cookie" }),
    ).toBe("encrypted cookie");

    await t.get("/foo/writeRawCookieTwo");
    await t.get("/foo/readEncrypted");
    expect(t.lastResponse().body).toBe(rbInspect("encrypted cookie"));

    await t.get("/foo/readRawCookie");
    expect(
      encryptor.decryptAndVerify(t.lastResponse().body, { purpose: "cookie.encrypted_cookie" }),
    ).toBe("encrypted cookie");
  });

  it("encrypted cookies rotating multiple encryption keys with cookies serializer as json", async () => {
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get(":controller(/:action)");
          this.post(":controller(/:action)");
        });
`,
    );

    await t.controller(
      "foo",
      `
        import { ActionController } from "@blazetrails/actionpack";
        import { TopLevel, rbInspect } from "@blazetrails/ruby-compat";
        export class FooController extends ActionController.Base {
          static {
            this.protectFromForgery({ with: "null_session" });
          }

          async writeRawCookieOne() {
            this.cookies().set("encrypted_cookie", TopLevel.TestEncryptors.firstGcm.encryptAndSign("encrypted cookie"));
            await this.head("ok");
          }

          async writeRawCookieTwo() {
            this.cookies().set("encrypted_cookie", TopLevel.TestEncryptors.secondGcm.encryptAndSign("encrypted cookie"));
            await this.head("ok");
          }

          async readEncrypted() {
            await this.render({ plain: rbInspect(this.cookies().encrypted.get("encrypted_cookie")) });
          }

          async readRawCookie() {
            await this.render({ plain: this.cookies().get("encrypted_cookie") });
          }
        }
`,
    );

    await t.addToConfig(`
        const { classAttribute, ActiveSupportJSON } = await import("@blazetrails/activesupport");
        const { MessageEncryptor } = await import("@blazetrails/activesupport/message-encryptor");
        const { Marshal, TopLevel, constSet } = await import("@blazetrails/ruby-compat");
        const { Trails } = await import("@blazetrails/trailties");
        const firstSecret = Trails.application!.keyGenerator().generateKey("first", 32);
        const secondSecret = Trails.application!.keyGenerator().generateKey("second", 32);

        constSet(TopLevel, "TestEncryptors", class {
          static {
            classAttribute.call(this, "firstGcm", { default: new MessageEncryptor(firstSecret, undefined, { cipher: "aes-256-gcm", serializer: ActiveSupportJSON }) });
            classAttribute.call(this, "secondGcm", { default: new MessageEncryptor(secondSecret, undefined, { cipher: "aes-256-gcm", serializer: ActiveSupportJSON }) });
          }
        });

        const config = Trails.application!.config;
        config.actionDispatch.useAuthenticatedCookieEncryption = true;
        config.actionDispatch.encryptedCookieCipher = "aes-256-gcm";
        config.actionDispatch.authenticatedEncryptedCookieSalt = "salt";
        config.actionDispatch.cookiesSerializer = ":json";

        const cookies = config.actionDispatch.cookiesRotations;
        cookies.rotate("encrypted", firstSecret);
        cookies.rotate("encrypted", secondSecret);
`);

    await import(`${await t.appPath()}/config/environment.ts`);

    const encryptor = new MessageEncryptor(
      t.app()!.keyGenerator().generateKey("salt", 32),
      undefined,
      {
        cipher: "aes-256-gcm",
      },
    );

    await t.get("/foo/writeRawCookieOne");
    await t.get("/foo/readEncrypted");
    expect(t.lastResponse().body).toBe(rbInspect("encrypted cookie"));

    await t.get("/foo/readRawCookie");
    expect(
      encryptor.decryptAndVerify(t.lastResponse().body, { purpose: "cookie.encrypted_cookie" }),
    ).toBe("encrypted cookie");

    await t.get("/foo/writeRawCookieTwo");
    await t.get("/foo/readEncrypted");
    expect(t.lastResponse().body).toBe(rbInspect("encrypted cookie"));

    await t.get("/foo/readRawCookie");
    expect(
      encryptor.decryptAndVerify(t.lastResponse().body, { purpose: "cookie.encrypted_cookie" }),
    ).toBe("encrypted cookie");
  });
});
