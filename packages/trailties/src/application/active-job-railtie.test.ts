import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import { Generation, Paths } from "../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface ActiveJobRailtieTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ActiveJobRailtieTest extends TestCase {}
include(ActiveJobRailtieTest, Paths);
include(ActiveJobRailtieTest, Generation);
include(ActiveJobRailtieTest, Isolation);

describe("ApplicationTests::ActiveJobRailtieTest", () => {
  let t: ActiveJobRailtieTest;

  beforeEach(async () => {
    t = new ActiveJobRailtieTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it(
    "jobs can set 'enqueue_after_transaction_commit' when eager_load is true",
    { timeout: 120_000 },
    async () => {
      await t.addToEnvConfig("development", "this.config.eagerLoad = true;");

      await t.appFile(
        "app/jobs/foo-job.ts",
        `
        import { Base } from "@blazetrails/activejob";
        export class FooJob extends Base {
          static {
            this.enqueueAfterTransactionCommit = "never";
          }
        }
`,
      );

      expect(
        (await t.trails(["runner", "console.log(FooJob.enqueueAfterTransactionCommit)"])).trim(),
      ).toBe("never");
    },
  );
});
