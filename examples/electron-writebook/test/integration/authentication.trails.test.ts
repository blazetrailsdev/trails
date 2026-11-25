import { beforeEach, describe, expect, it } from "vitest";
import { ApplicationIntegrationTest, fixture, loadFixtures } from "../test-helper.ts";
import type { Book } from "../../app/models/book.ts";

describe("Authentication", () => {
  let t: ApplicationIntegrationTest;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationIntegrationTest(expect.getState().currentTestName!);
  });

  it("returns to the page that asked for authentication once signed in", async () => {
    const book = await fixture<Book>("books", "handbook");
    await t.get(`/books/${book.id}/edit`);
    t.assertRedirectedTo("http://www.example.com/session/new");

    await t.post("/session", {
      params: { email_address: "kevin@example.com", password: "secret123456" },
    });

    t.assertRedirectedTo(`http://www.example.com/books/${book.id}/edit`);
  });

  it("sends the version headers on every response", async () => {
    await t.get("/session/new");

    expect(t.response.headers.get("x-version")).toBe(process.env.APP_VERSION ?? "0");
  });
});
