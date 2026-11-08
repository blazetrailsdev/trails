import { describe, expect, it } from "vitest";
import { Base } from "../../lib/base.js";
import { RoutingUrlFor } from "../../lib/routing-url-for.js";

describe("UrlHelper::ClassMethods", () => {
  it("names ActionView::RoutingUrlFor as the url_for module a view class includes", () => {
    expect((Base as unknown as { _urlForModules(): unknown })._urlForModules()).toBe(RoutingUrlFor);
  });
});
