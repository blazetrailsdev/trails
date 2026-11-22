export const check = `import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";

export class PostsController extends ApplicationController {
  async destroy(): Promise<void> {
    const post = await Post.find(this.params.expect("id"));
    await post.destory();
    await this.redirectTo("/posts", { status: 303 });
  }
}`;

export const checkError =
  "app/controllers/posts-controller.ts(7,16): error TS2551: Property 'destory' does not exist on type 'Post'. Did you mean 'destroy'?";

export const view = `<article>
  <h1><%= post.titel %></h1>
</article>`;

export const viewError =
  "app/views/posts/show.html.tse(2,16): error TS2551: Property 'titel' does not exist on type 'Post'. Did you mean 'title'?";

export function squiggle(error: string): { line: number; from: number; to: number } {
  const [, line, col, name] = /\((\d+),(\d+)\): error TS\d+: Property '([^']+)'/u.exec(error)!;
  const from = Number(col) - 1;
  return { line: Number(line), from, to: from + name.length };
}
