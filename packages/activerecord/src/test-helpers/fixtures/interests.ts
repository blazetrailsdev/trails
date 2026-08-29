import { ref } from "../../fixtures.js";

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
