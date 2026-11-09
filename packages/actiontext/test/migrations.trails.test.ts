import { describe, expect, it } from "vitest";
import { Base, Migration } from "@blazetrails/activerecord";
import { fixtures } from "../../activerecord/src/test-helpers/use-fixtures.js";
import "./test-helper.js";
import { CreateActionTextTables } from "../lib/db/migrate/20180528164100_create_action_text_tables.js";
import { Message } from "./dummy/app/models/message.js";
import { Review } from "./dummy/app/models/review.js";
import { Person } from "./dummy/app/models/person.js";
import { messages as messagesData } from "./fixtures/messages.js";
import { reviews as reviewsData } from "./fixtures/reviews.js";
import { people as peopleData } from "./fixtures/people.js";

describe("ActionText dummy database", () => {
  const { messages, reviews, people } = fixtures({
    messages: [Message, messagesData],
    reviews: [Review, reviewsData],
    people: [Person, peopleData],
  }) as never as {
    messages: (name: string) => Promise<Message>;
    reviews: (name: string) => Promise<Review>;
    people: (name: string) => Promise<Person>;
  };

  it("loads the dummy fixtures", async () => {
    expect((await messages("hello_alice")).subject).toBe("A message to Alice");
    expect((await people("alice")).name).toBe("Alice");
    const review = await reviews("hello_world");
    expect((await review.message)!.subject).toBe("A greeting");
  });

  it("migration creates action_text_rich_texts", async () => {
    const verbose = Migration.verbose;
    Migration.verbose = false;
    try {
      await CreateActionTextTables.migrate("down");
      await CreateActionTextTables.migrate("up");
    } finally {
      Migration.verbose = verbose;
    }
    const connection = await Base.leaseConnection();
    const columns = (await connection.columns("action_text_rich_texts")).map((c) => c.name);
    expect(columns).toEqual([
      "id",
      "name",
      "body",
      "record_type",
      "record_id",
      "created_at",
      "updated_at",
    ]);
  });
});
