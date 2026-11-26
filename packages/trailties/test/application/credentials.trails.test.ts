import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { File } from "@blazetrails/ruby-compat/file";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface CredentialsTest extends Generation, Pick<Rack, "app"> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CredentialsTest extends TestCase {}
include(CredentialsTest, Isolation);

describe("Trails::CredentialsTest", { timeout: 120_000 }, () => {
  let t: CredentialsTest;

  beforeEach(async () => {
    t = new CredentialsTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("secret_key_base read by an initializer before active_record encryption comes from credentials", async () => {
    await FileUtils.mkdirPAsync(await t.appPath("config/credentials"));
    await File.writeAsync(
      await t.appPath("config/credentials/production.key"),
      "2117e775dc2024d4f49ddf3aeb585919",
    );
    await File.writeAsync(
      await t.appPath("config/credentials/production.yml.enc"),
      "vgvKu4MBepIgZ5VHQMMPwnQNsLlWD9LKmJHu3UA/8yj6x+3fNhz3DwL9brX7UA==--qLdxHP6e34xeTAiI--nrcAsleXuo9NqiEuhntAhw==",
    );
    await t.addToConfig(`
        this.initializer("read_secret_key_base", { before: "active_record_encryption.configuration" }, async (app) => {
          const { File } = (await import("@blazetrails/ruby-compat"));
          return File.writeAsync(\`\${app.root()}/tmp/secret-key-base\`, app.config.secretKeyBase);
        });
`);
    await t.app("production");

    expect(await File.readAsync(await t.appPath("tmp/secret-key-base"))).toBe("secret");
  });
});
