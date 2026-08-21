/**
 * Trails-internal coverage for `Builder::HasAndBelongsToMany#through_model`
 * (has_and_belongs_to_many.rb:13-56) — Rails has no unit test for it, and the
 * property under test is the one its source comment states: "Table name needs
 * to be resolved lazily because RHS class might not have been loaded".
 *
 * Rides the canonical `developers` / `projects` / `developers_projects` tables
 * and the canonical `Developer` / `Project` models.
 */
import { describe, it, expect } from "vitest";
import "../../index.js";
import "../../support/canonical-model-index.js";
import { HasAndBelongsToMany } from "./has-and-belongs-to-many.js";
import { Developer } from "../../test-helpers/models/developer.js";

describe("Builder::HasAndBelongsToMany#throughModel", () => {
  it("resolves the join table name lazily", () => {
    const builder = new HasAndBelongsToMany("projects", Developer, {});
    let resolved = 0;
    const joinModel = builder.throughModel();
    const resolver = joinModel.tableNameResolver;
    joinModel.tableNameResolver = () => {
      resolved++;
      return resolver();
    };

    expect(resolved).toBe(0);
    expect(joinModel.tableName).toBe("developers_projects");
    expect(resolved).toBe(1);
    expect(joinModel.tableName).toBe("developers_projects");
    expect(resolved).toBe(1);
  });

  it("names the join model and both reflections after Rails", () => {
    const joinModel = new HasAndBelongsToMany("projects", Developer, {}).throughModel();

    expect(joinModel.name).toBe("HABTM_Projects");
    expect(joinModel.leftModel).toBe(Developer);
    expect(joinModel.leftReflection.name).toBe("leftSide");
    expect(joinModel.rightReflection.name).toBe("project");
    expect(joinModel.primaryKey).toEqual(["developer_id", "project_id"]);
  });
});
