/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Trails-internal HABTM harness — no 1:1 Rails counterpart. Rides the canonical
 * `developers` / `projects` / `developers_projects` tables and the canonical
 * `Developer` / `Project` models that drive `has_and_belongs_to_many` in Rails.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../index.js";
import { registerModel, association } from "../associations.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Developer as CanonicalDeveloper } from "../test-helpers/models/developer.js";
import { Project as CanonicalProject } from "../test-helpers/models/project.js";

describe("has_and_belongs_to_many", () => {
  const { developers, projects } = useHandlerFixtures(
    ["developers", "projects", "developersProjects"],
    { schema: canonicalSchema },
  );

  beforeEach(() => {
    registerModel("Developer", CanonicalDeveloper);
    registerModel("Project", CanonicalProject);
  });

  it("loads associated records through a join table", async () => {
    // `david` joins both projects via the `developers_projects` join table.
    const david = developers("david");
    const projectList = await association<CanonicalProject>(david, "projects").toArray();
    expect(projectList).toHaveLength(2);
    const names = projectList.map((p) => p.name).sort();
    expect(names).toEqual(["Active Controller", "Active Record"]);
  });

  it("uses default join table name (alphabetical)", async () => {
    // `Project.has_and_belongs_to_many :developers` declares no explicit
    // join table, so it resolves to the alphabetical default
    // ("developers" + "projects" -> "developers_projects").
    const activeRecord = projects("active_record");
    const devs = await association<CanonicalDeveloper>(activeRecord, "developers").toArray();
    expect(devs.length).toBeGreaterThan(0);
    expect(devs.map((d) => d.name)).toContain("David");
  });
});
