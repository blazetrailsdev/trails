import { Post } from "../models/post.ts";
import { Comment } from "../models/comment.ts";
import { ApplicationController } from "./application-controller.ts";

export class PostsController extends ApplicationController {
  static {
    this.beforeAction(":_setPost", { only: ["show", "edit", "update", "destroy"] });
  }

  declare posts: Post[];
  declare post: Post;
  declare comment: Comment;

  async index(): Promise<void> {
    const posts = this.params.get("filter") === "published" ? Post.published() : Post.recent();
    this.posts = await posts.toArray();
  }

  async show(): Promise<void> {
    this.comment = new Comment();
  }

  async new(): Promise<void> {
    this.post = new Post();
  }

  async edit(): Promise<void> {}

  async create(): Promise<void> {
    this.post = new Post(this._postParams());
    if (await this.post.save()) {
      console.log(`Created post #${this.post.id}`);
      await this.redirectTo(this.post, { notice: "Post was successfully created." });
    } else {
      await this.render("new", { status: ":unprocessable_content" });
    }
  }

  async update(): Promise<void> {
    if (await this.post.update(this._postParams())) {
      await this.redirectTo(this.post, {
        notice: "Post was successfully updated.",
        status: ":see_other",
      });
    } else {
      await this.render("edit", { status: ":unprocessable_content" });
    }
  }

  async destroy(): Promise<void> {
    await this.post.destroy();
    await this.redirectTo(
      { action: "index" },
      {
        notice: "Post was successfully destroyed.",
        status: ":see_other",
      },
    );
  }

  private async _setPost(): Promise<void> {
    this.post = await Post.find(this.params.expect("id"));
  }

  private _postParams() {
    return this.params.expect({ post: ["title", "body", "published"] });
  }
}
