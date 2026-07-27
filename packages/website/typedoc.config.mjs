import { OptionDefaults } from "typedoc";

// api-compare's JSDoc tag family (`docs/infrastructure/api-build-stub-generation-plan.md`)
// is machinery, not user documentation: declare the tags so TypeDoc does not
// warn on them, and exclude them so they never render. Both options replace
// TypeDoc's defaults rather than extending them, hence the spreads.
const apiCompareTags = ["@missingRailsCall", "@noRailsEquivalent"];

/** @type {Partial<import("typedoc").TypeDocOptions>} */
export default {
  $schema: "https://typedoc.org/schema.json",
  entryPoints: [
    "../arel",
    "../activemodel",
    "../activerecord",
    "../activesupport",
    "../rack",
    "../actionpack",
  ],
  entryPointStrategy: "packages",
  out: "docs/api",
  plugin: ["typedoc-plugin-markdown"],
  readme: "none",
  githubPages: false,
  excludeInternal: true,
  blockTags: [...OptionDefaults.blockTags, ...apiCompareTags],
  excludeTags: [...OptionDefaults.excludeTags, ...apiCompareTags],
  outputFileStrategy: "members",
  expandObjects: true,
  parametersFormat: "table",
  enumMembersFormat: "table",
  packageOptions: {
    entryPoints: ["src/index.ts"],
    excludeInternal: true,
  },
};
