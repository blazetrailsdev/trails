import { ApplicationController } from "./application-controller.js";
import { ApplicationRecord } from "../models/application-record.js";
import { Post } from "../models/post.js";

export class PostsController extends ApplicationController {
  async create(): Promise<void> {
    const post = new Post(this.params.expect({ post: ["title"] }));
    await post.save();
    await this.render({ json: { title: post.readAttribute("title") }, status: ":created" });
  }

  async preview(): Promise<void> {
    const title = await ApplicationRecord.connectedTo({ role: "reading" }, () =>
      new Post(this.params.expect({ post: ["title"] })).readAttribute("title"),
    );
    await this.render({ json: { title } });
  }
}
