import { Temporal } from "@blazetrails/date";
const twoWeeksAgo = Temporal.Instant.fromEpochMilliseconds(Date.now() - 14 * 24 * 60 * 60 * 1000);

export const pirateFixtureData = {
  blackbeard: {
    catchphrase: "Yar.",
    parrot: "george",
  },
  redbeard: {
    catchphrase: "Avast!",
    parrot: "louis",
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
