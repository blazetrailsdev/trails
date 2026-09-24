import { Trails } from "../../../../rails.js";

Trails.application!.config.filterParameters.push(
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
);
