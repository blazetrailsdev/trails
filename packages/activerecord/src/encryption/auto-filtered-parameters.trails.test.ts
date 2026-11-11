import { describe, it, expect } from "vitest";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Pirate } from "../test-helpers/models/pirate.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { AutoFilteredParameters } from "./auto-filtered-parameters.js";

describe("AutoFilteredParametersTrailsTest", () => {
  fixtures({});

  it("a namespaced model filters under its model_name.element, not its underscored path", () => {
    const application = { config: { filterParameters: [] as Array<string | RegExp> } };
    const autoFilteredParameters = new AutoFilteredParameters(application);

    class Admin {}
    constSet(TopLevel, "Admin", Admin);
    class Post extends Pirate {
      static {
        this.tableName = "pirates";
      }
    }
    constSet(Admin, "Post", Post);
    Post.encrypts("catchphrase");
    autoFilteredParameters.enable();

    expect(Post.modelName.name).toBe("Admin::Post");
    expect(application.config.filterParameters).toContain("post.catchphrase");
    expect(application.config.filterParameters).not.toContain("admin/post.catchphrase");
  });
});
