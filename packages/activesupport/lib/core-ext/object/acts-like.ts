import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActiveSupport } from "../../namespaces.js";

export function actsLike(this: unknown, duck: string): boolean {
  switch (duck) {
    case "time":
      return rbObjRespondTo(this, "actsLikeTime");
    case "date":
      return rbObjRespondTo(this, "actsLikeDate");
    case "string":
      return rbObjRespondTo(this, "actsLikeString");
    default:
      return rbObjRespondTo(this, ActiveSupport.Inflector.camelize(`acts_like_${duck}`, false));
  }
}
