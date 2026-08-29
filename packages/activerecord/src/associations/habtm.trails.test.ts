import { describe, it, expect } from "vitest";
import "../index.js";
import { association } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Developer as CanonicalDeveloper } from "../test-helpers/models/developer.js";
import { Project as CanonicalProject } from "../test-helpers/models/project.js";

describe("has_and_belongs_to_many", () => {
  const { developers, projects } = fixtures(["developers", "projects", "developersProjects"]);

  it("loads associated records through a join table", async () => {
    const david = developers("david");
    const projectList = await association<CanonicalProject>(david, "projects");
    expect(projectList).toHaveLength(2);
    const names = projectList.map((p) => p.name).sort();
    expect(names).toEqual(["Active Controller", "Active Record"]);
  });

  it("uses default join table name (alphabetical)", async () => {
    const activeRecord = projects("active_record");
    const devs = await association<CanonicalDeveloper>(activeRecord, "developers");
    expect(devs.length).toBeGreaterThan(0);
    expect(devs.map((d) => d.name)).toContain("David");
  });
});
