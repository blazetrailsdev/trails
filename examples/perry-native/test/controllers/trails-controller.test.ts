import { describe, it } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack";
import type { FixtureSetAccessor } from "@blazetrails/activerecord/test-fixtures";
import { assertDifference } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Trail } from "../../app/models/trail.js";
import "../test-helper.js";

export class TrailsControllerTest extends IntegrationTest {
  declare "@trail": Trail;
  declare trails: FixtureSetAccessor<Trail>;

  static {
    registerConstant("TrailsControllerTest", this);
    this.setup(async function (this: TrailsControllerTest) {
      this["@trail"] = await this.trails("one");
    });
  }
}

describe("TrailsControllerTest", () => {
  it("should get index", async ({ testCase: t }) => {
    await t.get(t.trailsUrl());
    t.assertResponse("success");
  });

  it("should get new", async ({ testCase: t }) => {
    await t.get(t.newTrailUrl());
    t.assertResponse("success");
  });

  it("should create trail", async ({ testCase: t }) => {
    await assertDifference(
      () => Trail.count(),
      async () => {
        await t.post(t.trailsUrl(), {
          params: { trail: { length: t["@trail"].length, name: t["@trail"].name } },
        });
      },
    );

    t.assertRedirectedTo(t.trailUrl(await Trail.last()));
  });

  it("should show trail", async ({ testCase: t }) => {
    await t.get(t.trailUrl(t["@trail"]));
    t.assertResponse("success");
  });

  it("should get edit", async ({ testCase: t }) => {
    await t.get(t.editTrailUrl(t["@trail"]));
    t.assertResponse("success");
  });

  it("should update trail", async ({ testCase: t }) => {
    await t.patch(t.trailUrl(t["@trail"]), {
      params: { trail: { length: t["@trail"].length, name: t["@trail"].name } },
    });
    t.assertRedirectedTo(t.trailUrl(t["@trail"]));
  });

  it("should destroy trail", async ({ testCase: t }) => {
    await assertDifference(
      () => Trail.count(),
      -1,
      async () => {
        await t.delete(t.trailUrl(t["@trail"]));
      },
    );

    t.assertRedirectedTo(t.trailsUrl());
  });
});
