import { Duration, toFs } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";

export const pirateFixtureData = {
  blackbeard: {
    catchphrase: "Yar.",
    parrot: "george",
  },
  redbeard: {
    catchphrase: "Avast!",
    parrot: "louis",
    created_on: toFs(Duration.weeks(2).ago(Time.now()), "db"),
    updated_on: toFs(Duration.weeks(2).ago(Time.now()), "db"),
  },
  mark: {
    catchphrase: "X marks the spot!",
  },
  "1": {
    catchphrase: "#1 pirate!",
  },
};
