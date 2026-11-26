import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFs, getPath } from "@blazetrails/ruby-compat/fs-adapter";
import { getOsAsync } from "@blazetrails/ruby-compat/os-adapter";
import { EncryptedConfiguration, InvalidContentError } from "../lib/encrypted-configuration.js";

describe("EncryptedConfiguration::InvalidContentError", () => {
  let tmpdir: string;
  let credentials: EncryptedConfiguration;
  let configPath: string;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    tmpdir = await fs.mkdtemp!(`${(await getOsAsync()).tmpdir()}${path.sep}config-`);
    configPath = path.join(tmpdir, "credentials.yml.enc");
    const keyPath = path.join(tmpdir, "master.key");
    await fs.writeFile!(keyPath, EncryptedConfiguration.generateKey());
    credentials = new EncryptedConfiguration({
      configPath,
      keyPath,
      envKey: "TRAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
  });

  afterEach(() => {
    getFs().rmSync(tmpdir, { recursive: true, force: true });
  });

  it("appends the Psych syntax error to its message", async () => {
    await credentials.write("key: value\nbad");
    const error = await credentials.config().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(InvalidContentError);
    const message = (error as InvalidContentError).message;
    expect(message.startsWith(`Invalid YAML in '${configPath}'.\n\n  `)).toBe(true);
    expect(message).toContain(((error as InvalidContentError).cause as Error).message);
  });

  it("answers only its own message without a Psych cause", () => {
    expect(new InvalidContentError("x.yml").message).toBe("Invalid YAML in 'x.yml'.");
  });
});
