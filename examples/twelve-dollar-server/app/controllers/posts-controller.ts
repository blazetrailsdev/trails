import { include, type Included } from "@blazetrails/activesupport";
import { RecordInvalid } from "@blazetrails/activerecord";
import { ApplicationController } from "./application-controller.ts";
import { PostIdentifiable } from "./concerns/post-identifiable.ts";
import { Current } from "../models/current.ts";
import { Post } from "../models/post.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface PostsController extends Included<typeof PostIdentifiable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PostsController extends ApplicationController {
  static {
    include(this, PostIdentifiable);

    this.allowUnauthenticatedAccess({ only: "show" });
    this.beforeAction(
      function (this: PostsController) {
        return this.requireValidPostId(this.params.get("id") as string);
      },
      { only: "show" },
    );
  }

  async show(): Promise<void> {
    const post = await Post.withDetails().find(this.params.get("id"));
    await this.render({ json: { post } });
  }

  async create(): Promise<unknown> {
    if (typeof this.params.get("body") !== "string") {
      return this.renderError("body is required", ":bad_request");
    }

    const post = new Post({
      user_id: Current.userId,
      author: Current.username,
      body: this.params.get("body"),
    });
    if (await post.save()) return this.render({ json: { post }, status: ":created" });
    if (!post.errors.isInclude("body")) throw new RecordInvalid(post);

    await this.renderError(post.errors.get("body")[0], ":bad_request");
  }
}
