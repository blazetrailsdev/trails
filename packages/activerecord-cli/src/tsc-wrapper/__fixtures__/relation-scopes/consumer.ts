import { Post } from "./post.js";

export const chained = Post.published().titled("x").statusArchived();
export const status = new Post().status;
