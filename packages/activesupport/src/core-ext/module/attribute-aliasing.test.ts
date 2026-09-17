import { describe, expect, it } from "vitest";
import { assertNotPredicate, assertPredicate } from "../../testing/assertions.js";

class Content {
  title: string | null = null;
  Data: string | null = null;

  isTitle(): boolean {
    return this.title !== null;
  }

  isData(): boolean {
    return this.Data !== null;
  }
}

class Email extends Content {
  get subject() {
    return this.title;
  }
  set subject(v) {
    this.title = v;
  }
  isSubject() {
    return this.isTitle();
  }

  get body() {
    return this.Data;
  }
  set body(v) {
    this.Data = v;
  }
  isBody() {
    return this.isData();
  }
}

describe("AttributeAliasingTest", () => {
  it("attribute alias", () => {
    const e = new Email();

    assertNotPredicate(e, (e) => e.isSubject());

    e.title = "Upgrade computer";
    expect(e.subject).toEqual("Upgrade computer");
    assertPredicate(e, (e) => e.isSubject());

    e.subject = "We got a long way to go";
    expect(e.title).toEqual("We got a long way to go");
    assertPredicate(e, (e) => e.isTitle());
  });

  it("aliasing to uppercase attributes", () => {
    const e = new Email();

    assertNotPredicate(e, (e) => e.isBody());
    assertNotPredicate(e, (e) => e.isData());

    e.body = "No, really, this is not a joke.";
    expect(e.Data).toEqual("No, really, this is not a joke.");
    assertPredicate(e, (e) => e.isData());

    e.Data = "Uppercased methods are the suck";
    expect(e.body).toEqual("Uppercased methods are the suck");
    assertPredicate(e, (e) => e.isBody());
  });
});
