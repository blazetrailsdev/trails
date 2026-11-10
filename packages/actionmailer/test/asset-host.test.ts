import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { assertDomEqual } from "@blazetrails/actionview/rails-dom-testing/assertions/dom-assertions";
import { afterEach, beforeEach, describe, it } from "vitest";
import type { Configuration } from "@blazetrails/activesupport";
import { Base } from "../lib/base.js";
import type { MessageDelivery } from "../lib/message-delivery.js";

class AssetHostMailer extends Base {
  static {
    this.prependViewPath(
      new FixtureResolver({
        "asset-host-mailer/email-with-asset.html.tse": '<%= imageTag("somelogo.png") %>',
      }),
    );
  }

  emailWithAsset() {
    return this.mail({
      to: "test@localhost",
      subject: "testing email containing asset path while asset_host is set",
      from: "tester@example.com",
    });
  }
}

type Mailer = typeof AssetHostMailer & Record<string, (...args: unknown[]) => MessageDelivery>;

describe("AssetHostTest", () => {
  let previousDeliveryMethod: typeof Base.deliveryMethod;

  beforeEach(() => {
    previousDeliveryMethod = Base.deliveryMethod;
    (AssetHostMailer as unknown as { configure(b: (c: Configuration) => void): void }).configure(
      (c) => {
        c.set("assetHost", "http://www.example.com");
      },
    );
  });

  afterEach(() => {
    Base.deliveries.length = 0;
    Base.deliveryMethod = previousDeliveryMethod;
  });

  it("asset host as string", async () => {
    const mail = await (AssetHostMailer as Mailer).emailWithAsset().message();
    assertDomEqual(
      '<img src="http://www.example.com/images/somelogo.png" />',
      mail.body().toString().trim(),
    );
  });

  it("asset host as one argument proc", async () => {
    AssetHostMailer.config().set("assetHost", (source: string) => {
      if (source.startsWith("/images")) {
        return "http://images.example.com";
      }
      return null;
    });
    const mail = await (AssetHostMailer as Mailer).emailWithAsset().message();
    assertDomEqual(
      '<img src="http://images.example.com/images/somelogo.png" />',
      mail.body().toString().trim(),
    );
  });
});
