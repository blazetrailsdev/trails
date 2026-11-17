/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/actionview/test-case.js";
import "../test-helper.js";
import { DriveHelper } from "../../lib/app/helpers/turbo/drive-helper.js";

type Tc = Record<string, any>;

class DriverHelperUnitTest extends TestCase {}
(DriverHelperUnitTest as any).tests(DriveHelper);

describe("Turbo::DriverHelperUnitTest", () => {
  let tc: Tc;

  beforeEach(async ({ task }) => {
    tc = new (DriverHelperUnitTest as any)(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
  });

  it("accepts valid Symbol and String method values", () => {
    for (const method of ["replace", "replace", "morph", "morph"]) {
      tc.assertDomEqual(
        `<meta name="turbo-refresh-method" content="${method}">\n`,
        String(tc.turboRefreshMethodTag(method)),
      );
    }
  });

  it("accepts valid Symbol and String scroll values", () => {
    for (const scroll of ["reset", "reset", "preserve", "preserve"]) {
      tc.assertDomEqual(
        `<meta name="turbo-refresh-scroll" content="${scroll}">\n`,
        String(tc.turboRefreshScrollTag(scroll)),
      );
    }
  });

  it("validate turbo refresh values", () => {
    expect(() => tc.turboRefreshesWith({ method: "invalid" })).toThrow(ArgumentError);

    expect(() => tc.turboRefreshesWith({ scroll: "invalid" })).toThrow(ArgumentError);
  });
});
