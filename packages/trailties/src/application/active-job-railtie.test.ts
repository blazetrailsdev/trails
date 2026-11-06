import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../test-helpers/isolation/abstract-unit.js";
import "../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface ActiveJobTrailtieTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ActiveJobTrailtieTest extends TestCase {}
include(ActiveJobTrailtieTest, Isolation);

describe("ActiveJobRailtieTest", () => {
  let t: ActiveJobTrailtieTest;

  beforeEach(async () => {
    t = new ActiveJobTrailtieTest("test");
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
        (await t.trails("runner", "console.log(FooJob.enqueueAfterTransactionCommit)")).trim(),
      ).toBe("never");
    },
  );
});
