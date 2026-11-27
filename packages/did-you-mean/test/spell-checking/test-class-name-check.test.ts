import type {} from "@blazetrails/vitest-matchers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NameError, TopLevel, constGet, constSet } from "@blazetrails/ruby-compat";
import "../../lib/did-you-mean.js";

const ACRONYM = {};

class Project {
  static bo0k(): unknown {
    return constGet(Project, "Bo0k");
  }
}

class Book {
  static TableOfContents = class TableOfContents {};

  tableofContents(): unknown {
    return constGet(Book, "TableofContents");
  }

  static Page = class Page {
    tableofContents(): unknown {
      return constGet(Book.Page, "TableofContents");
    }

    static tableofContents(): unknown {
      return constGet(Book.Page, "TableofContents");
    }
  };
}

const top = TopLevel as Record<string, unknown>;

function captureNameError(block: () => unknown): NameError & { corrections: string[] } {
  try {
    block();
  } catch (e) {
    return e as NameError & { corrections: string[] };
  }
  throw new Error("expected NameError");
}

function assertCorrection(expected: string, array: string[]): void {
  expect(array).toEqual([expected]);
}

describe("ClassNameCheckTest", () => {
  beforeAll(() => {
    constSet(TopLevel, "ACRONYM", ACRONYM);
    constSet(TopLevel, "Project", Project);
    constSet(TopLevel, "Book", Book);
    constSet(Book, "TableOfContents", Book.TableOfContents);
    constSet(Book, "Page", Book.Page);
  });
  afterAll(() => {
    for (const k of ["ACRONYM", "Project", "Book"]) delete top[k];
  });

  it("corrections", () => {
    expect(() => constGet(Object, "::Bo0k")).toThrow(NameError);
    const error = captureNameError(() => constGet(Object, "::Bo0k"));
    assertCorrection("Book", error.corrections);
  });

  it("corrections include case specific class name", () => {
    expect(() => constGet(Object, "::Acronym")).toThrow(NameError);
    const error = captureNameError(() => constGet(Object, "::Acronym"));
    assertCorrection("ACRONYM", error.corrections);
  });

  it("corrections include top level class name", () => {
    expect(() => Project.bo0k()).toThrow(NameError);
    const error = captureNameError(() => Project.bo0k());
    assertCorrection("Book", error.corrections);
  });

  it("names in corrections have namespaces", () => {
    expect(() => constGet(Object, "::Book::TableofContents")).toThrow(NameError);
    const error = captureNameError(() => constGet(Object, "::Book::TableofContents"));
    assertCorrection("Book::TableOfContents", error.corrections);
  });

  it("corrections candidates for names in upper level scopes", () => {
    expect(() => Book.Page.tableofContents()).toThrow(NameError);
    const error = captureNameError(() => Book.Page.tableofContents());
    assertCorrection("Book::TableOfContents", error.corrections);
  });

  it("corrections should work from within instance method", () => {
    expect(() => new Book().tableofContents()).toThrow(NameError);
    const error = captureNameError(() => new Book().tableofContents());
    assertCorrection("Book::TableOfContents", error.corrections);
  });

  it("corrections should work from within instance method on nested class", () => {
    expect(() => new Book.Page().tableofContents()).toThrow(NameError);
    const error = captureNameError(() => new Book.Page().tableofContents());
    assertCorrection("Book::TableOfContents", error.corrections);
  });

  it("does not suggest user input", () => {
    expect(() => constGet(Object, "::Book::Spine")).toThrow(NameError);
    const error = captureNameError(() => constGet(Object, "::Book::Spine"));

    constSet(Book, "Spine", class Spine {});

    expect(error.corrections).toBeEmpty();
  });
});
