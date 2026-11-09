import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { Base } from "../../../lib/base.js";

export class AssetMailer extends Base {
  static {
    this.setMailerName("asset_mailer");
    this.prependViewPath(
      new FixtureResolver({
        "asset-mailer/welcome.html.tse": '<%= imageTag("dummy.png") %>',
      }),
    );
  }

  welcome() {
    return this.mail();
  }
}
