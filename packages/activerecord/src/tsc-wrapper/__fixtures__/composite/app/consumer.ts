import { Post } from "./post.js";
import { Author } from "../models/author.js";

const post = new Post();
export const title: string = post.title;
// post.author resolves through the auto-import injected by
// trails-tsc in post.ts — the `Author` type is reachable via the
// cross-project `references:` edge.
export const author: Author | null = post.author;
