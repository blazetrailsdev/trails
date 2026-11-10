import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { FormBuilder } from "@blazetrails/actionview";
import { Base } from "../../../lib/base.js";

class SpecializedFormBuilder extends FormBuilder {
  message() {
    return "hi from SpecializedFormBuilder";
  }
}

export class FormBuilderMailer extends Base {
  static SpecializedFormBuilder = SpecializedFormBuilder;

  static {
    this.setMailerName("form_builder_mailer");
    this.prependViewPath(
      new FixtureResolver({
        "form-builder-mailer/welcome.html.tse":
          '<%= formWith({ url: "/" }, (f) => { %>\n  <%= f.message() %>\n<% }) %>\n',
      }),
    );
    this.defaultFormBuilder(SpecializedFormBuilder);
  }

  welcome() {
    return this.mail({ to: "email@example.com" });
  }
}
