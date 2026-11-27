import { ActionCable } from "@blazetrails/actioncable";
import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    ApplicationCable?: typeof ApplicationCable;
  }
}

export class Channel extends ActionCable.Channel.Base {}

export const ApplicationCable: { Channel: typeof Channel; Connection?: unknown } = { Channel };
TopLevel.ApplicationCable = ApplicationCable;
