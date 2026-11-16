import { rbObjRespondTo } from "@blazetrails/ruby-compat";

export function actsLike(this: unknown, duck: string): boolean {
  switch (duck) {
    case "time":
      return rbObjRespondTo(this, "actsLikeTime");
    case "date":
      return rbObjRespondTo(this, "actsLikeDate");
    case "string":
      return rbObjRespondTo(this, "actsLikeString");
    default:
      return rbObjRespondTo(
        this,
        `actsLike_${duck}`.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase()),
      );
  }
}
