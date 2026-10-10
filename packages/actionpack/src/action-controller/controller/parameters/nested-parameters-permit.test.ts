import { describe, it } from "vitest";
import {
  assertEmpty,
  assertEqual,
  assertNil,
  assertNot,
  assertNotNil,
  assertPredicate,
} from "@blazetrails/activesupport";
import { rbInspect } from "@blazetrails/ruby-compat";
import { Parameters } from "../../metal/strong-parameters.js";

describe("NestedParametersPermitTest", () => {
  function assertFilteredOut(params: Parameters, key: string) {
    assertNot(params.hasKey(key), `key ${rbInspect(key)} has not been filtered out`);
  }

  it("permitted nested parameters", () => {
    const params = new Parameters({
      book: {
        title: "Romeo and Juliet",
        authors: [
          {
            name: "William Shakespeare",
            born: "1564-04-26",
          },
          {
            name: "Christopher Marlowe",
          },
          {
            name: ["malicious", "injected", "names"],
          },
        ],
        details: {
          pages: 200,
          genre: "Tragedy",
        },
        id: {
          isbn: "x",
        },
      },
      magazine: "Mjallo!",
    });

    const permitted = params.permit({
      book: ["title", { authors: ["name"] }, { details: "pages" }, "id"],
    });

    assertPredicate(permitted, (p) => p.isPermitted());
    assertEqual("Romeo and Juliet", (permitted.get("book") as Parameters).get("title"));
    assertEqual(
      "William Shakespeare",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[0].get("name"),
    );
    assertEqual(
      "Christopher Marlowe",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[1].get("name"),
    );
    assertEqual(
      200,
      ((permitted.get("book") as Parameters).get("details") as Parameters).get("pages"),
    );

    assertFilteredOut(permitted, "magazine");
    assertFilteredOut(permitted.get("book") as Parameters, "id");
    assertFilteredOut((permitted.get("book") as Parameters).get("details") as Parameters, "genre");
    assertFilteredOut(
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[0],
      "born",
    );
    assertFilteredOut(
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[2],
      "name",
    );
  });

  it("permitted nested parameters with a string or a symbol as a key", () => {
    const params = new Parameters({
      book: {
        authors: [
          { name: "William Shakespeare", born: "1564-04-26" },
          { name: "Christopher Marlowe" },
        ],
      },
    });

    let permitted = params.permit({ book: [{ authors: ["name"] }] });

    assertEqual(
      "William Shakespeare",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[0].get("name"),
    );
    assertEqual(
      "William Shakespeare",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[0].get("name"),
    );
    assertEqual(
      "Christopher Marlowe",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[1].get("name"),
    );
    assertEqual(
      "Christopher Marlowe",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[1].get("name"),
    );

    permitted = params.permit({ book: [{ authors: ["name"] }] });

    assertEqual(
      "William Shakespeare",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[0].get("name"),
    );
    assertEqual(
      "William Shakespeare",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[0].get("name"),
    );
    assertEqual(
      "Christopher Marlowe",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[1].get("name"),
    );
    assertEqual(
      "Christopher Marlowe",
      ((permitted.get("book") as Parameters).get("authors") as Parameters[])[1].get("name"),
    );
  });

  it("nested arrays with strings", () => {
    const params = new Parameters({
      book: {
        genres: ["Tragedy"],
      },
    });

    const permitted = params.permit({ book: { genres: [] } });
    assertEqual(["Tragedy"], (permitted.get("book") as Parameters).get("genres"));
  });

  it("permit may specify symbols or strings", () => {
    const params = new Parameters({
      book: {
        title: "Romeo and Juliet",
        author: "William Shakespeare",
      },
      magazine: "Shakespeare Today",
    });

    const permitted = params.permit({ book: ["title", "author"] }, "magazine");
    assertEqual("Romeo and Juliet", (permitted.get("book") as Parameters).get("title"));
    assertEqual("William Shakespeare", (permitted.get("book") as Parameters).get("author"));
    assertEqual("Shakespeare Today", permitted.get("magazine"));
  });

  it("nested array with strings that should be hashes", () => {
    const params = new Parameters({
      book: {
        genres: ["Tragedy"],
      },
    });

    const permitted = params.permit({ book: { genres: "type" } });
    assertEmpty((permitted.get("book") as Parameters).get("genres") as unknown[]);
  });

  it("nested array with strings that should be hashes and additional values", () => {
    const params = new Parameters({
      book: {
        title: "Romeo and Juliet",
        genres: ["Tragedy"],
      },
    });

    const permitted = params.permit({ book: ["title", { genres: "type" }] });
    assertEqual("Romeo and Juliet", (permitted.get("book") as Parameters).get("title"));
    assertEmpty((permitted.get("book") as Parameters).get("genres") as unknown[]);
  });

  it("nested string that should be a hash", () => {
    const params = new Parameters({
      book: {
        genre: "Tragedy",
      },
    });

    const permitted = params.permit({ book: { genre: "type" } });
    assertNil((permitted.get("book") as Parameters).get("genre"));
  });

  it("nested params with numeric keys", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "0": { name: "William Shakespeare", age_of_death: "52" },
          "1": { name: "Unattributed Assistant" },
          "2": { name: ["injected", "names"] },
        },
      },
    });
    const permitted = params.permit({ book: { authors_attributes: ["name"] } });

    assertNotNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("0"),
    );
    assertNotNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("1"),
    );
    assertEmpty(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
        "2",
      ) as Parameters,
    );
    assertEqual(
      "William Shakespeare",
      (
        ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
          "0",
        ) as Parameters
      ).get("name"),
    );
    assertEqual(
      "Unattributed Assistant",
      (
        ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
          "1",
        ) as Parameters
      ).get("name"),
    );

    assertEqual(
      {
        book: {
          authors_attributes: {
            "0": { name: "William Shakespeare" },
            "1": { name: "Unattributed Assistant" },
            "2": {},
          },
        },
      },
      permitted.toH(),
    );

    assertFilteredOut(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
        "0",
      ) as Parameters,
      "age_of_death",
    );
  });

  it("nested params with non_numeric keys", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "0": { name: "William Shakespeare", age_of_death: "52" },
          "1": { name: "Unattributed Assistant" },
          "2": "Not a hash",
          new_record: { name: "Some name" },
        },
      },
    });
    const permitted = params.permit({ book: { authors_attributes: ["name"] } });

    assertNotNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("0"),
    );
    assertNotNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("1"),
    );

    assertNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("2"),
    );
    assertNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
        "new_record",
      ),
    );
    assertEqual(
      "William Shakespeare",
      (
        ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
          "0",
        ) as Parameters
      ).get("name"),
    );
    assertEqual(
      "Unattributed Assistant",
      (
        ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
          "1",
        ) as Parameters
      ).get("name"),
    );

    assertEqual(
      {
        book: {
          authors_attributes: {
            "0": { name: "William Shakespeare" },
            "1": { name: "Unattributed Assistant" },
          },
        },
      },
      permitted.toH(),
    );
  });

  it("nested params with negative numeric keys", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "-1": { name: "William Shakespeare", age_of_death: "52" },
          "-2": { name: "Unattributed Assistant" },
        },
      },
    });
    const permitted = params.permit({ book: { authors_attributes: ["name"] } });

    assertNotNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("-1"),
    );
    assertNotNil(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get("-2"),
    );
    assertEqual(
      "William Shakespeare",
      (
        ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
          "-1",
        ) as Parameters
      ).get("name"),
    );
    assertEqual(
      "Unattributed Assistant",
      (
        ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
          "-2",
        ) as Parameters
      ).get("name"),
    );

    assertFilteredOut(
      ((permitted.get("book") as Parameters).get("authors_attributes") as Parameters).get(
        "-1",
      ) as Parameters,
      "age_of_death",
    );
  });

  it("nested params with numeric keys addressing individual numeric keys", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "0": { name: "William Shakespeare", age_of_death: "52" },
          "1": { name: "Unattributed Assistant" },
          "2": { name: ["injected", "names"] },
        },
      },
    });
    const permitted = params.permit({
      book: { authors_attributes: { "1": ["name"], "0": ["name", "age_of_death"] } },
    });

    assertEqual(
      {
        book: {
          authors_attributes: {
            "0": { name: "William Shakespeare", age_of_death: "52" },
            "1": { name: "Unattributed Assistant" },
          },
        },
      },
      permitted.toH(),
    );
  });

  it("nested params with numeric keys addressing individual numeric keys using require first", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "0": { name: "William Shakespeare", age_of_death: "52" },
          "1": { name: "Unattributed Assistant" },
          "2": { name: ["injected", "names"] },
        },
      },
    });

    const permitted = params.expect({
      book: { authors_attributes: { "1": ["name"] } },
    }) as Parameters;

    assertEqual(
      { authors_attributes: { "1": { name: "Unattributed Assistant" } } },
      permitted.toH(),
    );
  });

  it("nested params with numeric keys addressing individual numeric keys to arrays", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "0": ["draft 1", "draft 2", "draft 3"],
          "1": ["final draft"],
          "2": { name: ["injected", "names"] },
        },
      },
    });
    const permitted = params.permit({ book: { authors_attributes: { "2": ["name"], "0": [] } } });

    assertEqual(
      { book: { authors_attributes: { "2": {}, "0": ["draft 1", "draft 2", "draft 3"] } } },
      permitted.toH(),
    );
  });

  it("nested params with numeric keys addressing individual numeric keys to more nested params", () => {
    const params = new Parameters({
      book: {
        authors_attributes: {
          "0": ["draft 1", "draft 2", "draft 3"],
          "1": ["final draft"],
          "2": { name: { projects: ["hamlet", "Othello"] } },
        },
      },
    });
    const permitted = params.permit({
      book: { authors_attributes: { "2": { name: { projects: [] } }, "0": [] } },
    });

    assertEqual(
      {
        book: {
          authors_attributes: {
            "2": { name: { projects: ["hamlet", "Othello"] } },
            "0": ["draft 1", "draft 2", "draft 3"],
          },
        },
      },
      permitted.toH(),
    );
  });

  it("nested number as key", () => {
    let params = new Parameters({
      product: {
        properties: {
          "0": "prop0",
          "1": "prop1",
        },
      },
    });
    params = params.expect({ product: { properties: ["0"] } }) as Parameters;
    assertNotNil((params.get("properties") as Parameters).get("0"));
    assertNil((params.get("properties") as Parameters).get("1"));
    assertEqual("prop0", (params.get("properties") as Parameters).get("0"));
  });
});
