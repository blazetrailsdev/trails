import { describe, it, expect } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("MultiParameterAttributesTest", () => {
  it("permitted multi-parameter attribute keys", () => {
    const params = new Parameters({
      book: {
        "shipped_at(1i)": "2012",
        "shipped_at(2i)": "3",
        "shipped_at(3i)": "25",
        "shipped_at(4i)": "10",
        "shipped_at(5i)": "15",
        "published_at(1i)": "1999",
        "published_at(2i)": "2",
        "published_at(3i)": "5",
        "price(1)": "R$",
        "price(2f)": "2.02",
      },
    });

    const permitted = params.permit({ book: ["shipped_at", "price"] });

    expect(permitted.permitted).toBe(true);

    const book = permitted.get("book") as Parameters;
    expect(book.get("shipped_at(1i)")).toBe("2012");
    expect(book.get("shipped_at(2i)")).toBe("3");
    expect(book.get("shipped_at(3i)")).toBe("25");
    expect(book.get("shipped_at(4i)")).toBe("10");
    expect(book.get("shipped_at(5i)")).toBe("15");

    expect(book.get("price(1)")).toBe("R$");
    expect(book.get("price(2f)")).toBe("2.02");

    expect(book.get("published_at(1i)")).toBeUndefined();
    expect(book.get("published_at(2i)")).toBeUndefined();
    expect(book.get("published_at(3i)")).toBeUndefined();
  });
});
