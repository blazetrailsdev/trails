import { InfoTimezone } from "./info-timezone.js";

export class DataTimezone extends InfoTimezone {
  canonicalZone(): DataTimezone {
    return this;
  }
}
