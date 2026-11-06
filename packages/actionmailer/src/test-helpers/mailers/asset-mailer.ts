import { ActionView } from "@blazetrails/actionpack";
import { Base } from "../../base.js";

export class AssetMailer extends Base {
  static {
    this.setMailerName("asset_mailer");
    this.prependViewPath(
      new ActionView.FixtureResolver({
        "asset-mailer/welcome.html.tse": '<%= imageTag("dummy.png") %>',
      }),
    );
  }

  welcome() {
    return this.mail();
  }
}
