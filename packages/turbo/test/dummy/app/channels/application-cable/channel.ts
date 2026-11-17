import { ActionCable } from "@blazetrails/actioncable";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Channel extends ActionCable.Channel.Base {}

export const ApplicationCable: { Channel: typeof Channel; Connection?: unknown } = { Channel };
constSet(TopLevel, "ApplicationCable", ApplicationCable);
