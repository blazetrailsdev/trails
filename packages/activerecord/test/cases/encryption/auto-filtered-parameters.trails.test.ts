import { describe, it, expect } from "vitest";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Pirate } from "../../models/pirate.js";
import { fixtures } from "../../support/use-fixtures.js";
import { AutoFilteredParameters } from "../../../lib/encryption/auto-filtered-parameters.js";

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

  it("an encrypted attribute is added to the model's filter_attributes", () => {
    const application = { config: { filterParameters: [] as Array<string | RegExp> } };
    const autoFilteredParameters = new AutoFilteredParameters(application);

    class FilteredPirate extends Pirate {
      static {
        this.tableName = "pirates";
      }
    }
    FilteredPirate.encrypts("catchphrase");
    autoFilteredParameters.enable();

    expect(FilteredPirate.filterAttributes).toContain("catchphrase");
    expect(Pirate.filterAttributes).not.toContain("catchphrase");
  });
});
