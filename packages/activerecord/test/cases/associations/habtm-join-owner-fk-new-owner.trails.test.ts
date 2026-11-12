import { describe, it, expect } from "vitest";
import { fixtures } from "../../support/use-fixtures.js";
import { Base } from "../../../lib/index.js";
import { Project } from "../../models/project.js";
import { Developer } from "../../models/developer.js";

describe("HABTM join row built against a new owner", () => {
  fixtures(["developers", "projects", "developersProjects"]);

  it("writes the owner foreign key on the join row once the owner is saved", async () => {
    const developer = new Developer({ name: "Aredridel", salary: 50000 });
    await developer.projects.concat(await Project.find(1));
    expect(developer.isNewRecord()).toBe(true);

    expect(await developer.save()).toBe(true);

    const joinFks = await (
      await Base.leaseConnection()
    ).selectValues("SELECT developer_id FROM developers_projects WHERE project_id = 1");
    expect(joinFks).toContain(developer.id);
    expect(joinFks).not.toContain(null);
  });
});
