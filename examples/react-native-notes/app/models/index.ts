import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Note } from "./note";
import { Notebook } from "./notebook";

constSet(TopLevel, "Notebook", Notebook);
constSet(TopLevel, "Note", Note);

export { Note, Notebook };
