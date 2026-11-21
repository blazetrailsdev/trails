import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { EnvHelpers } from "../support/env-helpers.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface CredentialsTest extends Generation, Pick<Rack, "app">, EnvHelpers {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CredentialsTest extends TestCase {
  async writeCredentialsOverride(name: string, { withKey = true } = {}) {
    await FileUtils.mkdirPAsync(await this.appPath("config/credentials"));
    if (withKey) {
      await File.writeAsync(
        await this.appPath(`config/credentials/${name}.key`),
        this.credentialsKey(),
      );
    }

    await File.writeAsync(
      await this.appPath(`config/credentials/${name}.yml.enc`),
      "vgvKu4MBepIgZ5VHQMMPwnQNsLlWD9LKmJHu3UA/8yj6x+3fNhz3DwL9brX7UA==--qLdxHP6e34xeTAiI--nrcAsleXuo9NqiEuhntAhw==",
    );
  }

  credentialsKey() {
    return "2117e775dc2024d4f49ddf3aeb585919";
  }
}
include(CredentialsTest, Isolation);
include(CredentialsTest, EnvHelpers);
registerSpecType(/^Trails::CredentialsTest$/, CredentialsTest);

const mystery = async () =>
  ((await Trails.application!.credentials()) as never as Record<string, unknown>).mystery;

describe("Trails::CredentialsTest", { timeout: 120_000 }, () => {
  let t: CredentialsTest;

  beforeEach(async () => {
    t = new CredentialsTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("reads credentials from environment specific path", async () => {
    await t.writeCredentialsOverride("production");

    await t.app("production");

    expect(await mystery()).toBe("revealed");
  });

  it("reads credentials from customized path and key", async () => {
    await t.writeCredentialsOverride("staging");
    await t.addToEnvConfig(
      "production",
      `this.config.credentials.contentPath = \`\${this.config.root}/config/credentials/staging.yml.enc\`;`,
    );
    await t.addToEnvConfig(
      "production",
      `this.config.credentials.keyPath = \`\${this.config.root}/config/credentials/staging.key\`;`,
    );

    await t.app("production");

    expect(await mystery()).toBe("revealed");
  });

  it("reads credentials using environment variable key", async () => {
    await t.writeCredentialsOverride("production", { withKey: false });

    await t.switchEnv("TRAILS_MASTER_KEY", t.credentialsKey(), async () => {
      await t.app("production");

      expect(await mystery()).toBe("revealed");
    });
  });
});
