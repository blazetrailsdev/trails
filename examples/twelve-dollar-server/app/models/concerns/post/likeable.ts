import { Concern, extend } from "@blazetrails/activesupport";

type Concern = {
  included(base: null, block: (this: never) => void): void;
  classMethods(block: (mod: Record<string, unknown>) => void): void;
};
import type { Base } from "@blazetrails/activerecord";
import { Like } from "../../like.ts";

export const Likeable = {
  async likeBy(this: Base, userId: number): Promise<boolean> {
    return (
      (await Like.insert({ user_id: userId, post_id: this.id }, { returning: [":post_id"] })).rows
        .length > 0
    );
  },
};

extend(Likeable, Concern);

(Likeable as unknown as Concern).included(null, function (this: typeof Base) {
  this.hasMany("likes");
});
