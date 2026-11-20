import { afterEach, beforeEach, describe, it } from "vitest";
import { getFs, getOsAsync, getPath, Hash, KeyError, setEnv } from "@blazetrails/ruby-compat";
import { Psych } from "@blazetrails/ruby-compat/psych";
import {
  EncryptedConfiguration,
  InvalidContentError,
  InvalidKeyError,
} from "../lib/encrypted-configuration.js";
import {
  assert,
  assertEqual,
  assertMatch,
  assertNot,
  assertNil,
  assertNoMatch,
  assertRaise,
} from "../lib/testing/assertions.js";

describe("EncryptedConfigurationTest", () => {
  let tmpdir: string;
  let credentials: EncryptedConfiguration;
  let credentialsConfigPath: string;
  let credentialsKeyPath: string;

  const invalidKey = (key: string): string =>
    `Key '${key}' is invalid, it must respond to '#to_sym' from configuration in '${credentialsConfigPath}'.`;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    tmpdir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${path.sep}config-`);
    credentialsConfigPath = path.join(tmpdir, "credentials.yml.enc");
    credentialsKeyPath = path.join(tmpdir, "master.key");
    await fs.writeFile!(credentialsKeyPath, EncryptedConfiguration.generateKey());
    credentials = new EncryptedConfiguration({
      configPath: credentialsConfigPath,
      keyPath: credentialsKeyPath,
      envKey: "TRAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
  });

  afterEach(() => {
    getFs().rmSync(tmpdir, { recursive: true, force: true });
  });

  it("reading configuration by env key", async () => {
    await getFs().unlink!(credentialsKeyPath);

    try {
      setEnv("TRAILS_MASTER_KEY", EncryptedConfiguration.generateKey());
      await credentials.write("something:\n  good: true\n  bad: false\n");
      await credentials.config();
      const creds = credentials as unknown as Record<string, any>;

      assert(creds.get("something").get("good"));
      assertNot(credentials.dig("something", "bad"));
      assertNil(creds.fetch("nothing", null));
    } finally {
      setEnv("TRAILS_MASTER_KEY", undefined);
    }
  });
  it("reading configuration by key file", async () => {
    await credentials.write("something:\n  good: true\n  bad: false\n  nested:\n    foo: bar\n");
    await credentials.config();
    const creds = credentials as unknown as Record<string, any>;

    assert(creds.something.get("good"));
    assertNot(creds.something.get("bad"));
    assert(creds.something.good);
    assertNot(creds.something.bad);
    assertEqual("bar", credentials.dig("something", "nested", "foo"));
    assertEqual("bar", creds.something.nested.foo);
    assertEqual(["something"], creds.keys());
    assertEqual(["good", "bad", "nested"], creds.something.keys());
    assertEqual({ good: true, bad: false, nested: { foo: "bar" } }, creds.something);
  });
  it("reading comment-only configuration", async () => {
    await credentials.write("# comment");

    assertEqual({}, await credentials.config());
  });
  it("writing with element assignment and reading with element reference", async () => {
    await credentials.config();
    const creds = credentials as unknown as Record<string, any>;
    creds.set("foo", 42);
    assertEqual(42, creds.get("foo"));
  });
  it("writing with dynamic accessor and reading with element reference", async () => {
    await credentials.config();
    const creds = credentials as unknown as Record<string, any>;
    creds.foo = 42;
    assertEqual(42, creds.get("foo"));
  });
  it("change configuration by key file", async () => {
    await credentials.write("something:\n  good: true\n");
    await credentials.change(async (configFile) => {
      const config = Psych.load(await getFs().readFile(configFile, "utf8")) as Hash<
        string,
        unknown
      >;
      await getFs().writeFile!(configFile, Psych.dump(config.merge({ new: "things" })));
    });
    await credentials.config();
    const creds = credentials as unknown as Record<string, any>;

    assert(creds.something.get("good"));
    assertEqual("things", creds.get("new"));
  });
  it("raises helpful error when loading invalid content", async () => {
    await credentials.write("key: value\nbad");

    await assertRaise([InvalidContentError], {}, () => credentials.config());
  });
  it("raises helpful error when validating invalid content", async () => {
    await credentials.write("key: value\nbad");

    await assertRaise([InvalidContentError], {}, () => credentials.validateBang());
  });
  it("raises helpful error when loading invalid content with unsupported keys", async () => {
    await credentials.write("42: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("42") }, () => credentials.config());

    await credentials.write("42.0: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("42.0") }, () => credentials.config());

    await credentials.write("Off: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("false") }, () =>
      credentials.config(),
    );
  });
  it("raises helpful error when validating invalid content with unsupported keys", async () => {
    await credentials.write("42: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("42") }, () =>
      credentials.validateBang(),
    );

    await credentials.write("42.0: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("42.0") }, () =>
      credentials.validateBang(),
    );

    await credentials.write("Off: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("false") }, () =>
      credentials.validateBang(),
    );
  });
  it("raises key error when accessing config via bang method", async () => {
    await credentials.config();
    const creds = credentials as unknown as Record<string, any>;
    await assertRaise([KeyError], {}, () => creds["something!"]());
  });
  it("inspect does not show unencrypted attributes", async () => {
    const secret = "something secret";
    await credentials.write(`secret: ${secret}\n`);
    await credentials.config();

    assertNoMatch(new RegExp(secret), credentials.inspect());
    assertMatch(/^#<ActiveSupport::EncryptedConfiguration:0x[0-9a-f]+>$/, credentials.inspect());
  });
});
