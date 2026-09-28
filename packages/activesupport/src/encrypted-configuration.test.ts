import { afterEach, beforeEach, describe, it } from "vitest";
import { getFs, getOsAsync, getPath } from "@blazetrails/ruby-compat";
import {
  EncryptedConfiguration,
  InvalidContentError,
  InvalidKeyError,
} from "./encrypted-configuration.js";
import { assertEqual, assertMatch, assertNoMatch, assertRaise } from "./testing/assertions.js";

describe("EncryptedConfigurationTest", () => {
  let tmpdir: string;
  let credentials: EncryptedConfiguration;
  let credentialsConfigPath: string;

  const invalidKey = (key: string): string =>
    `Key '${key}' is invalid, it must respond to '#to_sym' from configuration in '${credentialsConfigPath}'.`;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    tmpdir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${path.sep}config-`);
    credentialsConfigPath = path.join(tmpdir, "credentials.yml.enc");
    const credentialsKeyPath = path.join(tmpdir, "master.key");
    await fs.writeFile!(credentialsKeyPath, EncryptedConfiguration.generateKey());
    credentials = new EncryptedConfiguration({
      configPath: credentialsConfigPath,
      keyPath: credentialsKeyPath,
      envKey: "RAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
  });

  afterEach(() => {
    getFs().rmSync(tmpdir, { recursive: true, force: true });
  });

  it.skip("reading configuration by env key");
  it("reading configuration by key file", async () => {
    await credentials.write("something:\n  good: true\n  bad: false\n  nested:\n    foo: bar\n");
    await credentials.config();
    const creds = credentials as unknown as Record<string, any>;

    assertEqual(true, creds.something.get("good"));
    assertEqual(false, creds.something.get("bad"));
    assertEqual(true, creds.something.good);
    assertEqual(false, creds.something.bad);
    assertEqual("bar", credentials.dig("something", "nested", "foo"));
    assertEqual("bar", creds.something.nested.foo);
    assertEqual(["something"], creds.keys());
    assertEqual(["good", "bad", "nested"], creds.something.keys());
    const something = { ...creds.something.toH(), nested: creds.something.nested.toH() };
    assertEqual({ good: true, bad: false, nested: { foo: "bar" } }, something);
  });
  it("reading comment-only configuration", async () => {
    await credentials.write("# comment");

    assertEqual({}, await credentials.config());
  });
  it.skip("writing with element assignment and reading with element reference");
  it.skip("writing with dynamic accessor and reading with element reference");
  it.skip("change configuration by key file");
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

    await credentials.write("Off: value");
    await assertRaise([InvalidKeyError], { match: invalidKey("false") }, () =>
      credentials.validateBang(),
    );
  });
  it.skip("raises key error when accessing config via bang method");
  it("inspect does not show unencrypted attributes", async () => {
    const secret = "something secret";
    await credentials.write(`secret: ${secret}\n`);
    await credentials.config();

    assertNoMatch(new RegExp(secret), credentials.inspect());
    assertMatch(/^#<ActiveSupport::EncryptedConfiguration:0x[0-9a-f]+>$/, credentials.inspect());
  });
});
