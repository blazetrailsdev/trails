import { Temporal } from "@blazetrails/activesupport/temporal";
import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/pirates.yml
const twoWeeksAgo = Temporal.Instant.fromEpochMilliseconds(Date.now() - 14 * 24 * 60 * 60 * 1000);

export const pirateFixtureData = {
  blackbeard: {
    catchphrase: "Yar.",
    parrot_id: ref("parrots", "george"),
  },
  redbeard: {
    catchphrase: "Avast!",
    parrot_id: ref("parrots", "louis"),
    created_on: twoWeeksAgo,
    updated_on: twoWeeksAgo,
  },
  mark: {
    catchphrase: "X marks the spot!",
  },
  "1": {
    catchphrase: "#1 pirate!",
  },
};
