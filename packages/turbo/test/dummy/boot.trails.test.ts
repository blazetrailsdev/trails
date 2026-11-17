import { describe, expect, it } from "vitest";
import "../test-helper.js";
import { Article } from "./app/models/article.js";
import { Board } from "./app/models/board.js";
import { Comment } from "./app/models/comment.js";
import { Company } from "./app/models/company.js";
import { Message } from "./app/models/message.js";
import { Profile } from "./app/models/users/profile.js";
import "./app/controllers/articles-controller.js";
import "./app/controllers/messages-controller.js";
import "./app/controllers/notifications-controller.js";
import "./app/controllers/posts-controller.js";
import "./app/controllers/admin/companies-controller.js";
import "./app/controllers/api/application-controller.js";
import "./app/controllers/users/profiles-controller.js";

describe("dummy app boot", () => {
  it("loads every dummy model", async () => {
    const article = await Article.create({ body: "Hello World" });
    expect(article.toParam()).toBe("hello-world");
    const comment = await Comment.create({ article, body: "Nice" });
    expect(comment.article_id).toBe(article.id);
    expect((await Board.create({ name: "Board" })).isPersisted()).toBe(true);
    expect(String(await Message.create({ content: "Hi" }))).toBe("Hi");
    expect(new Company({ id: 1, name: "Basecamp" }).toPartialPath()).toBe("companies/company");
    expect(new Profile({ id: 1, name: "David" }).toParam()).toBe("users:profile:1");
  });
});
