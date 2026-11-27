import { Base } from "@blazetrails/activejob";
import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    ApplicationJob?: typeof ApplicationJob;
  }
}

export class ApplicationJob extends Base {}
TopLevel.ApplicationJob = ApplicationJob;
