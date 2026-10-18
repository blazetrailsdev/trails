import { describe, expect, it } from "vitest";
import "../../test-helpers/abstract-unit.js";
import { RouteSet } from "@blazetrails/actionpack";
import { renderContent } from "../../test-helpers/tse-block-test-case.js";

describe("TagHelperTest", () => {
  it("form_for works", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/blah/update", { to: "blah#update" });
    });
    const output = await renderContent(
      "formFor('staticpage', { url: { controller: 'blah', action: 'update' } }, ",
      "",
      routes,
    );
    expect(output).toMatch(/<form.*action="\/blah\/update".*method="post">.*<\/form>/);
  });
});
