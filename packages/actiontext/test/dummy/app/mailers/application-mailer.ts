import { Base } from "@blazetrails/actionmailer";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class ApplicationMailer extends Base {
  static {
    this.default({ from: "from@example.com" });
    (this as unknown as { layout(name: string): void }).layout("mailer");
  }
}
constSet(TopLevel, "ApplicationMailer", ApplicationMailer);
