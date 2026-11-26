import { describe, it, expect } from "vitest";
import { constSet } from "@blazetrails/ruby-compat/include";
import { rbModRemoveConst } from "@blazetrails/ruby-compat/variable";
import { Admin } from "../../models/admin.js";
import { Pirate } from "../../models/pirate.js";
import { fixtures } from "../../support/use-fixtures.js";
import { AutoFilteredParameters } from "../../../lib/encryption/auto-filtered-parameters.js";

describe("AutoFilteredParametersTrailsTest", () => {
  fixtures({});

  it("a namespaced model filters under its model_name.element, not its underscored path", () => {
    const application = { config: { filterParameters: [] as Array<string | RegExp> } };
    const autoFilteredParameters = new AutoFilteredParameters(application);

    class Post extends Pirate {
      static {
        this.tableName = "pirates";
      }
    }
    constSet(Admin, "Post", Post);
    try {
      Post.encrypts("catchphrase");
      autoFilteredParameters.enable();

      expect(Post.modelName.name).toBe("Admin::Post");
      expect(application.config.filterParameters).toContain("post.catchphrase");
      expect(application.config.filterParameters).not.toContain("admin/post.catchphrase");
    } finally {
      rbModRemoveConst(Admin, "Post");
    }
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

  it("a class with a JS name but no Ruby name filters under the bare attribute", () => {
    const application = { config: { filterParameters: [] as Array<string | RegExp> } };
    const autoFilteredParameters = new AutoFilteredParameters(application);

    const unseated = class extends Pirate {
      static {
        this.tableName = "pirates";
      }
    };
    unseated.encrypts("catchphrase");
    autoFilteredParameters.enable();

    expect(unseated.name).toBe("unseated");
    expect(application.config.filterParameters).toContain("catchphrase");
  });
});
