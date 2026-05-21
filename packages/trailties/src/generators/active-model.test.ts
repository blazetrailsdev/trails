import { describe, it, expect } from "vitest";
import { ActiveModel } from "./active-model.js";

describe("ActiveModel", () => {
  it("class + instance methods emit Ruby-shape snippets", () => {
    expect([
      ActiveModel.all("Foo"),
      ActiveModel.find("Foo", "params[:id]"),
      ActiveModel.find("Foo"),
      ActiveModel.build("Foo", "x"),
      ActiveModel.build("Foo"),
    ]).toEqual(["Foo.all", "Foo.find(params[:id])", "Foo.find()", "Foo.new(x)", "Foo.new"]);
    const m = new ActiveModel("@foo");
    expect([m.save(), m.update("x"), m.errors(), m.destroy()]).toEqual([
      "@foo.save",
      "@foo.update(x)",
      "@foo.errors",
      "@foo.destroy!",
    ]);
  });
});
