import { describe, expect, it, type TestContext } from "vitest";
import { Assertion, assertMatch, assertRaises, presence } from "@blazetrails/activesupport";
import { hashAref, registerConstant } from "@blazetrails/ruby-compat";
import "../test-helpers/test-helper.js";
import { Base } from "./base.js";
import { TestCase, type TestRequest } from "./test-case.js";

type ConnectionContext = TestContext & { testCase: TestCase };
type Cookies = { get(key: string): unknown; set(key: string, value: unknown): unknown };

class SimpleConnection extends Base {
  static disconnectedUserId: unknown;

  declare userId: unknown;

  connect(): void {
    this.userId =
      hashAref((this.request as unknown as TestRequest).params, "user_id") ??
      (this.cookies as unknown as Cookies).get("user_id");
  }

  disconnect(): void {
    SimpleConnection.disconnectedUserId = this.userId;
  }
}
SimpleConnection.identifiedBy("userId");
registerConstant("SimpleConnection", SimpleConnection);

class ConnectionSimpleTest extends TestCase {}
ConnectionSimpleTest.tests(SimpleConnection);
registerConstant("ConnectionSimpleTest", ConnectionSimpleTest);

const cookiesOf = (t: TestCase): Cookies => t.cookies() as unknown as Cookies;
const connectionOf = <T>(t: TestCase): T => t.connection as unknown as T;

describe("ConnectionSimpleTest", () => {
  it("connected", async ({ testCase: t }: ConnectionContext) => {
    await t.connect();

    expect(connectionOf<SimpleConnection>(t).userId).toBeNull();
  });

  it("url params", async ({ testCase: t }: ConnectionContext) => {
    await t.connect("/cable?user_id=323");

    expect(connectionOf<SimpleConnection>(t).userId).toBe("323");
  });

  it("params", async ({ testCase: t }: ConnectionContext) => {
    await t.connect(undefined, { params: { user_id: 323 } });

    expect(connectionOf<SimpleConnection>(t).userId).toBe("323");
  });

  it("plain cookie", async ({ testCase: t }: ConnectionContext) => {
    cookiesOf(t).set("user_id", "456");

    await t.connect();

    expect(connectionOf<SimpleConnection>(t).userId).toBe("456");
  });

  it("plain cookie with explicit value and string key", async ({
    testCase: t,
  }: ConnectionContext) => {
    cookiesOf(t).set("user_id", { value: "456" });

    await t.connect();

    expect(connectionOf<SimpleConnection>(t).userId).toBe("456");
  });

  it("disconnect", async ({ testCase: t }: ConnectionContext) => {
    cookiesOf(t).set("user_id", "456");

    await t.connect();

    expect(connectionOf<SimpleConnection>(t).userId).toBe("456");

    await t.disconnect();

    expect(SimpleConnection.disconnectedUserId).toBe("456");
  });
});

class Connection extends Base {
  static disconnectedUserId: unknown;

  declare currentUserId: unknown;
  declare token: unknown;

  connect(): void {
    this.currentUserId = this.verifyUser();
    this.token = ((this.request as unknown as TestRequest).headers as unknown as Cookies).get(
      "X-API-TOKEN",
    );
    (this.logger as unknown as { addTags(...tags: string[]): unknown }).addTags("ActionCable");
  }

  /** @internal */
  private verifyUser(): unknown {
    return (
      presence((this.cookies as unknown as { signed: Cookies }).signed.get("user_id")) ??
      this.rejectUnauthorizedConnection()
    );
  }
}
Connection.identifiedBy("currentUserId");
Connection.identifiedBy("token");
registerConstant("Connection", Connection);

class ConnectionTest extends TestCase {}
registerConstant("ConnectionTest", ConnectionTest);

describe("ConnectionTest", () => {
  it("connected with signed cookies and headers", async ({ testCase: t }: ConnectionContext) => {
    (t.cookies() as unknown as { signed: Cookies }).signed.set("user_id", "456");

    await t.connect(undefined, { headers: { "X-API-TOKEN": "abc" } });

    expect(connectionOf<Connection>(t).token).toBe("abc");
    expect(connectionOf<Connection>(t).currentUserId).toBe("456");
  });

  it("connected when no signed cookies set", async ({ testCase: t }: ConnectionContext) => {
    cookiesOf(t).set("user_id", "456");

    await t.assertRejectConnection(() => t.connect());
  });

  it("connection rejected", async ({ testCase: t }: ConnectionContext) => {
    await t.assertRejectConnection(() => t.connect());
  });

  it("connection rejected assertion message", async ({ testCase: t }: ConnectionContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertRejectConnection(() => "Intentionally doesn't connect."),
    );

    assertMatch(/Expected to reject connection/, (error as Error).message);
  });
});

class EncryptedCookiesConnection extends Base {
  declare userId: unknown;

  connect(): void {
    this.userId = this.verifyUser();
  }

  /** @internal */
  private verifyUser(): unknown {
    return (
      presence((this.cookies as unknown as { encrypted: Cookies }).encrypted.get("user_id")) ??
      this.rejectUnauthorizedConnection()
    );
  }
}
EncryptedCookiesConnection.identifiedBy("userId");
registerConstant("EncryptedCookiesConnection", EncryptedCookiesConnection);

class EncryptedCookiesConnectionTest extends TestCase {}
EncryptedCookiesConnectionTest.tests(EncryptedCookiesConnection);
registerConstant("EncryptedCookiesConnectionTest", EncryptedCookiesConnectionTest);

describe("EncryptedCookiesConnectionTest", () => {
  it("connected with encrypted cookies", async ({ testCase: t }: ConnectionContext) => {
    (t.cookies() as unknown as { encrypted: Cookies }).encrypted.set("user_id", "456");

    await t.connect();

    expect(connectionOf<EncryptedCookiesConnection>(t).userId).toBe("456");
  });

  it("connected with encrypted cookies with explicit value and symbol key", async ({
    testCase: t,
  }: ConnectionContext) => {
    (t.cookies() as unknown as { encrypted: Cookies }).encrypted.set("user_id", { value: "456" });

    await t.connect();

    expect(connectionOf<EncryptedCookiesConnection>(t).userId).toBe("456");
  });

  it("connection rejected", async ({ testCase: t }: ConnectionContext) => {
    await t.assertRejectConnection(() => t.connect());
  });
});

class SessionConnection extends Base {
  declare userId: unknown;

  connect(): void {
    this.userId = this.verifyUser();
  }

  /** @internal */
  private verifyUser(): unknown {
    return (
      presence(hashAref((this.request as unknown as TestRequest).session as object, "user_id")) ??
      this.rejectUnauthorizedConnection()
    );
  }
}
SessionConnection.identifiedBy("userId");
registerConstant("SessionConnection", SessionConnection);

class SessionConnectionTest extends TestCase {}
SessionConnectionTest.tests(SessionConnection);
registerConstant("SessionConnectionTest", SessionConnectionTest);

describe("SessionConnectionTest", () => {
  it("connected with encrypted cookies", async ({ testCase: t }: ConnectionContext) => {
    await t.connect(undefined, { session: { user_id: "789" } });
    expect(connectionOf<SessionConnection>(t).userId).toBe("789");
  });

  it("connection rejected", async ({ testCase: t }: ConnectionContext) => {
    await t.assertRejectConnection(() => t.connect());
  });
});

class EnvConnection extends Base {
  declare user: unknown;

  connect(): void {
    this.user = this.verifyUser();
  }

  /** @internal */
  private verifyUser(): unknown {
    return (
      (this.env as Record<string, { user: unknown } | undefined>)["authenticator"]?.user ??
      this.rejectUnauthorizedConnection()
    );
  }
}
EnvConnection.identifiedBy("user");
registerConstant("EnvConnection", EnvConnection);

class EnvConnectionTest extends TestCase {}
EnvConnectionTest.tests(EnvConnection);
registerConstant("EnvConnectionTest", EnvConnectionTest);

describe("EnvConnectionTest", () => {
  it("connected with env", async ({ testCase: t }: ConnectionContext) => {
    const authenticator = class {
      get user(): string {
        return "David";
      }
    };

    await t.connect(undefined, { env: { authenticator: new authenticator() } });

    expect(connectionOf<EnvConnection>(t).user).toBe("David");
  });

  it("connection rejected", async ({ testCase: t }: ConnectionContext) => {
    await t.assertRejectConnection(() => t.connect());
  });
});
