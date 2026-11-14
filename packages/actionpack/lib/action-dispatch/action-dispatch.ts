import { NameError } from "@blazetrails/ruby-compat";
import { ActionDispatch } from "../namespaces.js";

export class MissingController extends NameError {}

ActionDispatch.MissingController = MissingController;
