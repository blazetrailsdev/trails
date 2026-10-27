import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./actions/create-file.js";
import * as m1 from "./actions/create-link.js";
import * as m2 from "./actions/empty-directory.js";
import * as m3 from "./actions/file-manipulation.js";
import * as m4 from "./actions/inject-into-file.js";
import * as m5 from "./command.js";
import * as m6 from "./core-ext/hash-with-indifferent-access.js";
import * as m7 from "./error.js";
import * as m8 from "./group.js";
import * as m9 from "./line-editor/basic.js";
import * as m10 from "./nested-context.js";
import * as m11 from "./parser/argument.js";
import * as m12 from "./parser/arguments.js";
import * as m13 from "./parser/option.js";
import * as m14 from "./parser/options.js";
import * as m15 from "./shell/basic.js";
import * as m16 from "./shell/color.js";
import * as m17 from "./shell/column-printer.js";
import * as m18 from "./shell/table-printer.js";
import * as m19 from "./shell/wrapped-printer.js";

registerClassPaths([
  [() => m3.CapturableERB, "Thor::Actions::CapturableERB"],
  [() => m0.CreateFile, "Thor::Actions::CreateFile"],
  [() => m1.CreateLink, "Thor::Actions::CreateLink"],
  [() => m2.EmptyDirectory, "Thor::Actions::EmptyDirectory"],
  [() => m4.InjectIntoFile, "Thor::Actions::InjectIntoFile"],
  [() => m7.AmbiguousCommandError, "Thor::AmbiguousCommandError"],
  [() => m11.Argument, "Thor::Argument"],
  [() => m12.Arguments, "Thor::Arguments"],
  [() => m7.AtLeastOneRequiredArgumentError, "Thor::AtLeastOneRequiredArgumentError"],
  [() => m5.Command, "Thor::Command"],
  [() => m6.HashWithIndifferentAccess, "Thor::CoreExt::HashWithIndifferentAccess"],
  [() => m5.DynamicCommand, "Thor::DynamicCommand"],
  [() => m7.Error, "Thor::Error"],
  [() => m7.ExclusiveArgumentError, "Thor::ExclusiveArgumentError"],
  [() => m8.Group, "Thor::Group"],
  [() => m5.HiddenCommand, "Thor::HiddenCommand"],
  [() => m7.InvocationError, "Thor::InvocationError"],
  [() => m9.Basic, "Thor::LineEditor::Basic"],
  [() => m7.MalformattedArgumentError, "Thor::MalformattedArgumentError"],
  [() => m10.NestedContext, "Thor::NestedContext"],
  [() => m13.Option, "Thor::Option"],
  [() => m14.Options, "Thor::Options"],
  [() => m7.RequiredArgumentMissingError, "Thor::RequiredArgumentMissingError"],
  [() => m15.Basic, "Thor::Shell::Basic"],
  [() => m16.Color, "Thor::Shell::Color"],
  [() => m17.ColumnPrinter, "Thor::Shell::ColumnPrinter"],
  [() => m18.TablePrinter, "Thor::Shell::TablePrinter"],
  [() => m19.WrappedPrinter, "Thor::Shell::WrappedPrinter"],
  [() => m7.UndefinedCommandError, "Thor::UndefinedCommandError"],
  [() => m7.UnknownArgumentError, "Thor::UnknownArgumentError"],
]);
