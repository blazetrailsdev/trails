import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface IntegrationTestCaseTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class IntegrationTestCaseTest extends TestCase {}
include(IntegrationTestCaseTest, Isolation);
registerSpecType(/^IntegrationTestCaseTest$/, IntegrationTestCaseTest);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface IntegrationTestDefaultApp extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class IntegrationTestDefaultApp extends TestCase {}
include(IntegrationTestDefaultApp, Isolation);
registerSpecType(/^IntegrationTestDefaultApp$/, IntegrationTestDefaultApp);

describe("IntegrationTestCaseTest", { timeout: 300_000 }, () => {
  let t: IntegrationTestCaseTest;

  beforeEach(async () => {
    t = new IntegrationTestCaseTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("resets Action Mailer test deliveries", async () => {
    await t.trails("generate", "mailer", "BaseMailer", "welcome");

    await t.appFile(
      "test/integration/mailer-integration.test.ts",
      `
        import "../test-helper.ts";
        import { ActionDispatch } from "@blazetrails/actionpack";
        import { Base as ActionMailerBase } from "@blazetrails/actionmailer";
        import { TopLevel } from "@blazetrails/ruby-compat";

        class MailerIntegrationTest extends ActionDispatch.IntegrationTest {
          static {
            this.setup(function () {
              this._oldDeliveryMethod = ActionMailerBase.deliveryMethod;
              ActionMailerBase.deliveryMethod = "test";
            });

            this.teardown(function () {
              ActionMailerBase.deliveryMethod = this._oldDeliveryMethod;
            });

            for (const i of [0, 1]) {
              this.test(\`resets deliveries \${i}\`, async function () {
                await TopLevel.BaseMailer.welcome().deliverNow();
                this.assertEqual(1, ActionMailerBase.deliveries.length);
              });
            }
          }
        }
`,
    );

    await t.withTrailsEnv("test", () => t.trails("db:migrate"));
    const output = await t.trails("test");
    expect(output).toMatch(/0 failures, 0 errors/);
  });
});

describe("IntegrationTestDefaultApp", { timeout: 300_000 }, () => {
  let t: IntegrationTestDefaultApp;

  beforeEach(async () => {
    t = new IntegrationTestDefaultApp("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("app method of integration tests returns test_app by default", async () => {
    await t.appFile(
      "test/integration/default-app.test.ts",
      `
        import "../test-helper.ts";
        import { ActionDispatch } from "@blazetrails/actionpack";

        class DefaultAppIntegrationTest extends ActionDispatch.IntegrationTest {
          static {
            this.test("app returns action dispatch test app by default", function () {
              this.assertEqual(ActionDispatch.testApp, this.app());
            });
          }
        }
`,
    );

    await t.withTrailsEnv("test", () => t.trails("db:migrate"));
    const output = await t.trails("test");
    expect(output).toMatch(/0 failures, 0 errors/);
  });
});
