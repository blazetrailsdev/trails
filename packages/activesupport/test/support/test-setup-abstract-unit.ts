import { setToTimePreservesTimezone } from "../../lib/active-support.js";
import { deprecator } from "../../lib/deprecator.js";

deprecator().silence(() => {
  setToTimePreservesTimezone(true);
});
