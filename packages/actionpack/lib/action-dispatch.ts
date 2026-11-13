import { NameError, constSet } from "@blazetrails/ruby-compat";
import { ActionDispatch } from "./namespaces.js";

/** @noRailsEquivalent CONVERGEABLE seats-kept-for-class-paths-the-table-cannot-name */
export class MissingController extends NameError {}

constSet(ActionDispatch, "MissingController", MissingController);
