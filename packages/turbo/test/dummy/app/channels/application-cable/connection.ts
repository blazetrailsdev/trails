import { ActionCable } from "@blazetrails/actioncable";
import { ApplicationCable } from "./channel.js";

export class Connection extends ActionCable.Connection.Base {}

ApplicationCable.Connection = Connection;
