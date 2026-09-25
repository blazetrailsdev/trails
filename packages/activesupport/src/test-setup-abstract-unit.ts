import { setToTimePreservesTimezone } from "./active-support.js";
import { deprecator } from "./deprecator.js";

deprecator().silence(() => {
  setToTimePreservesTimezone(true);
});
