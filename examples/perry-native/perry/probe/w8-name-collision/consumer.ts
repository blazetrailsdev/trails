import { helper } from "./decoy.js";
import { Shared } from "./real.js";

export const made = new Shared((s) => {
  console.log("[repro]", s.defineThing("x"));
});
export const helped = helper();
