import { Trails } from "@blazetrails/trailties";

Trails.application!.config.filterParameters = Trails.application!.config.filterParameters.concat([
  "passw",
  "secret",
  "token",
  "_key",
  "crypt",
  "salt",
  "certificate",
  "otp",
  "ssn",
]);
