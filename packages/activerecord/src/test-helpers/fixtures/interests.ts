import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/interests.yml
// `human`, `zine`, `polymorphic_human` are association names kept verbatim
// (schema has `human_id`, `zine_id`, `polymorphic_human_id` + `_type`).
// The "gordon (Human)" polymorphic shorthand is preserved as a string.
export const interestFixtureData = {
  trainspotting: {
    topic: "Trainspotting",
    zine: ref("zines", "staying_in"),
    human: ref("humans", "gordon"),
  },
  birdwatching: {
    topic: "Birdwatching",
    zine: ref("zines", "staying_in"),
    human: ref("humans", "gordon"),
  },
  stamp_collecting: {
    topic: "Stamp Collecting",
    zine: ref("zines", "staying_in"),
    human: ref("humans", "gordon"),
  },
  hunting: {
    topic: "Hunting",
    zine: ref("zines", "going_out"),
    human: ref("humans", "steve"),
  },
  woodsmanship: {
    topic: "Woodsmanship",
    zine: ref("zines", "going_out"),
    human: ref("humans", "steve"),
  },
  survival: {
    topic: "Survival",
    zine: ref("zines", "going_out"),
    human: ref("humans", "steve"),
  },
  llama_wrangling: {
    topic: "Llama Wrangling",
    polymorphic_human: "gordon (Human)",
  },
};
