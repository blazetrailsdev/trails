import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { JoinDependency } from "./join-dependency.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("JoinDependency#reflections", () => {
  fixtures(["authors", "posts", "comments"]);

  it("drops the join root and reads each node's own reflection", () => {
    const jd = new JoinDependency(Author, null, "posts.comments", Nodes.OuterJoin);

    expect(jd.reflections).toEqual([
      Author.reflectOnAssociation("posts"),
      Post.reflectOnAssociation("comments"),
    ]);
    expect(jd.reflections).not.toContain(undefined);
  });

  it("lists a through association once, not once per chain hop", () => {
    const jd = new JoinDependency(Author, null, "comments", Nodes.OuterJoin);

    expect(jd.reflections).toEqual([Author.reflectOnAssociation("comments")]);
    expect(jd.reflections[0].klass).toBe(Comment);
  });
});
