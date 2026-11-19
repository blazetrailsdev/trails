import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    ApplicationHelper?: typeof ApplicationHelper;
  }
}

export const ApplicationHelper = {};
TopLevel.ApplicationHelper = ApplicationHelper;
