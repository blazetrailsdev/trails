import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Developer } from "../test-helpers/models/developer.js";

describe("HasAndBelongsToManyAssociationsTest (trails)", () => {
  fixtures(["developers", "projects", "developersProjects"]);

  it("join model update_all and delete_all borrow a pooled connection", async () => {
    const joinModel = Developer._reflectOnAssociation("developers_projects")!.klass;
    expect(joinModel.name).toBe("HABTM_Projects");

    const updated = await joinModel.all().updateAll({ joined_on: null });
    expect(updated).toBeGreaterThan(0);
    expect(await joinModel.all().deleteAll()).toBe(updated);
    expect(await joinModel.count()).toBe(0);
  });
});
