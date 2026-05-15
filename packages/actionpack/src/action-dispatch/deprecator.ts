import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

export const deprecator = new Deprecation({ gem: "actionpack" });
