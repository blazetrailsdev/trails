import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/interests.yml
// Rails YAML uses association-name keys (`human:`, `zine:`,
// `polymorphic_human: gordon (Human)`); translated to the FK columns
// (`human_id`, `zine_id`, `polymorphic_human_id` + `_type`) for
// loadability. The "gordon (Human)" polymorphic shorthand splits into
// the id ref + the type string.
export const interestFixtureData = {
  trainspotting: {
    topic: "Trainspotting",
    zine_id: ref("zines", "staying_in"),
    human_id: ref("humans", "gordon"),
  },
  birdwatching: {
    topic: "Birdwatching",
    zine_id: ref("zines", "staying_in"),
    human_id: ref("humans", "gordon"),
  },
  stamp_collecting: {
    topic: "Stamp Collecting",
    zine_id: ref("zines", "staying_in"),
    human_id: ref("humans", "gordon"),
  },
  hunting: {
    topic: "Hunting",
    zine_id: ref("zines", "going_out"),
    human_id: ref("humans", "steve"),
  },
  woodsmanship: {
    topic: "Woodsmanship",
    zine_id: ref("zines", "going_out"),
    human_id: ref("humans", "steve"),
  },
  survival: {
    topic: "Survival",
    zine_id: ref("zines", "going_out"),
    human_id: ref("humans", "steve"),
  },
  llama_wrangling: {
    topic: "Llama Wrangling",
    polymorphic_human_id: ref("humans", "gordon"),
    polymorphic_human_type: "Human",
  },
};
