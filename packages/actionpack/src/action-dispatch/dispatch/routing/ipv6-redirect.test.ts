import { beforeEach, describe, it } from "vitest";
import { assertEqual } from "@blazetrails/activesupport";
import { include } from "@blazetrails/ruby-compat";
import { Base } from "../../../action-controller/base.js";
import { controllerConstants } from "../../http/request.js";
import { RouteSet } from "../../routing/route-set.js";
import { IntegrationTest } from "../../testing/integration.js";
import "../../../test-helpers/abstract-unit.js";

const Routes = new RouteSet();

class BadRouteRequestController extends Base {
  static {
    include(this, Routes.urlHelpers());
  }

  async index(): Promise<void> {
    await this.render({ plain: (this as unknown as { fooPath(): string }).fooPath() });
  }

  foo(): void {
    this.redirectTo({ action: "index" });
  }
}
controllerConstants.set("bad_route_request", BadRouteRequestController);

Routes.draw(function () {
  this.get("/", { to: "bad_route_request#index", as: "index" });
  this.get("/foo", { to: "bad_route_request#foo", as: "foo" });
});

describe("IPv6IntegrationTest", () => {
  class IPv6IntegrationTest extends IntegrationTest {
    static Routes = Routes;
    static APP = this.buildApp(Routes);

    static {
      include(this, Routes.urlHelpers());
    }

    override get _routes(): RouteSet {
      return Routes;
    }

    override get app(): unknown {
      return IPv6IntegrationTest.APP;
    }
  }

  let t: IPv6IntegrationTest;
  beforeEach(({ task }) => {
    t = new IPv6IntegrationTest(task.name);
  });

  it("bad IPv6 redirection", async () => {
    const requestEnv = {
      REMOTE_ADDR: "fd07:2fa:6cff:2112:225:90ff:fec7:22aa",
      HTTP_HOST: "[fd07:2fa:6cff:2112:225:90ff:fec7:22aa]:3000",
      SERVER_NAME: "[fd07:2fa:6cff:2112:225:90ff:fec7:22aa]",
      SERVER_PORT: 3000,
    };

    await t.get("/foo", { env: requestEnv });
    t.assertResponse("redirect");
    assertEqual("http://[fd07:2fa:6cff:2112:225:90ff:fec7:22aa]:3000/", t.redirectToUrl());
  });
});
