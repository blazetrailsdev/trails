import { describe, it, expect, beforeAll } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Base } from "../index.js";
import { Project } from "../test-helpers/models/project.js";
import { AuditLog, Developer } from "../test-helpers/models/developer.js";
import { registerModel } from "../index.js";

describe("HABTM join row built against a new owner", () => {
  fixtures(["developers", "projects", "developersProjects"]);

  beforeAll(async () => {
    for (const model of [Developer, AuditLog, Project]) await registerModel(model);
  });

  it("writes the owner foreign key on the join row once the owner is saved", async () => {
    const developer = new Developer({ name: "Aredridel", salary: 50000 });
    await developer.projects.concat(await Project.find(1));
    expect(developer.isNewRecord()).toBe(true);

    expect(await developer.save()).toBe(true);

    const joinFks = await Base.connection.selectValues(
      "SELECT developer_id FROM developers_projects WHERE project_id = 1",
    );
    expect(joinFks).toContain(developer.id);
    expect(joinFks).not.toContain(null);
  });
});
