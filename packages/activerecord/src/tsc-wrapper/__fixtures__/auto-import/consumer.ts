import { Post } from "./post.js";
import { Author } from "./author.js";

const post = new Post();
export const title: string = post.title;
// post.author is typed as `Author | null` via the auto-imported
// declare in post.ts — this just verifies it resolves.
export const author: Author | null = post.author;
