import { afterEach, beforeEach, describe, it } from "vitest";
import { getFs, getOsAsync, getPath } from "@blazetrails/ruby-compat";
import { EncryptedConfiguration, InvalidContentError } from "./encrypted-configuration.js";
import { assertEqual, assertRaise } from "./testing/assertions.js";

describe("EncryptedConfigurationTest", () => {
  let tmpdir: string;
  let credentials: EncryptedConfiguration;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    tmpdir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${path.sep}config-`);
    const credentialsConfigPath = path.join(tmpdir, "credentials.yml.enc");
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
  it.skip("reading configuration by key file");
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
  it.skip("raises helpful error when validating invalid content");
  it.skip("raises helpful error when loading invalid content with unsupported keys");
  it.skip("raises helpful error when validating invalid content with unsupported keys");
  it.skip("raises key error when accessing config via bang method");
  it.skip("inspect does not show unencrypted attributes");
});
