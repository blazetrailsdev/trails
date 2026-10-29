import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../application-controller.ts";
import { PostIdentifiable } from "../concerns/post-identifiable.ts";
import { Current } from "../../models/current.ts";
import { Post } from "../../models/post.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface LikesController extends Included<typeof PostIdentifiable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LikesController extends ApplicationController {
  static {
    include(this, PostIdentifiable);

    this.beforeAction(function (this: LikesController) {
      return this.requireValidPostId(this.params.get("post_id") as string);
    });
  }

  async create(): Promise<void> {
    const post = await Post.select("id").find(this.params.get("post_id"));
    const liked = await post.likeBy(Current.user_id!);
    await this.render({
      json: { liked: true, already_liked: !liked, post_id: post.id },
      status: liked ? ":created" : ":ok",
    });
  }
}
