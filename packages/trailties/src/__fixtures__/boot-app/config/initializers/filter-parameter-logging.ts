import { Trails } from "../../../../rails.js";

Trails.application!.config.filterParameters = Trails.application!.config.filterParameters.concat([
  "passw",
  "email",
  "secret",
  "token",
  "_key",
  "crypt",
  "salt",
  "certificate",
  "otp",
  "ssn",
  "cvv",
  "cvc",
]);
