import { describe, it } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { UrlGenerationError } from "../../action-controller/metal/exceptions.js";
import { RouteSet } from "./route-set.js";

describe("HelperTest", () => {
  class Duck {
    toParam(): null {
      return null;
    }
  }

  it("exception", async () => {
    const rs = new RouteSet();
    rs.draw(function () {
      this.resources("ducks", () => {
        this.member(() => {
          this.get("pond");
        });
      });
    });

    const x = class {};
    include(x, rs.urlHelpers());
    await assertRaises([UrlGenerationError], {}, () => {
      (new x() as { pondDuckPath(duck: Duck): string }).pondDuckPath(new Duck());
    });
  });
});
