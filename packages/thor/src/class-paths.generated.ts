import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./actions.js";
import * as m1 from "./actions/create-file.js";
import * as m2 from "./actions/create-link.js";
import * as m3 from "./actions/empty-directory.js";
import * as m4 from "./actions/file-manipulation.js";
import * as m5 from "./actions/inject-into-file.js";
import * as m6 from "./base.js";
import * as m7 from "./command.js";
import * as m8 from "./core-ext/hash-with-indifferent-access.js";
import * as m9 from "./error.js";
import * as m10 from "./group.js";
import * as m11 from "./invocation.js";
import * as m12 from "./line-editor/basic.js";
import * as m13 from "./nested-context.js";
import * as m14 from "./parser/argument.js";
import * as m15 from "./parser/arguments.js";
import * as m16 from "./parser/option.js";
import * as m17 from "./parser/options.js";
import * as m18 from "./shell.js";
import * as m19 from "./shell/basic.js";
import * as m20 from "./shell/color.js";
import * as m21 from "./shell/column-printer.js";
import * as m22 from "./shell/table-printer.js";
import * as m23 from "./shell/wrapped-printer.js";

registerClassPaths([
  [() => m0.Actions, "Thor::Actions"],
  [() => m4.CapturableERB, "Thor::Actions::CapturableERB"],
  [() => m0.ClassMethods, "Thor::Actions::ClassMethods"],
  [() => m1.CreateFile, "Thor::Actions::CreateFile"],
  [() => m2.CreateLink, "Thor::Actions::CreateLink"],
  [() => m3.EmptyDirectory, "Thor::Actions::EmptyDirectory"],
  [() => m5.InjectIntoFile, "Thor::Actions::InjectIntoFile"],
  [() => m9.AmbiguousCommandError, "Thor::AmbiguousCommandError"],
  [() => m14.Argument, "Thor::Argument"],
  [() => m15.Arguments, "Thor::Arguments"],
  [() => m9.AtLeastOneRequiredArgumentError, "Thor::AtLeastOneRequiredArgumentError"],
  [() => m6.Base, "Thor::Base"],
  [() => m6.ClassMethods, "Thor::Base::ClassMethods"],
  [() => m7.Command, "Thor::Command"],
  [() => m8.CoreExt, "Thor::CoreExt"],
  [() => m8.HashWithIndifferentAccess, "Thor::CoreExt::HashWithIndifferentAccess"],
  [() => m7.DynamicCommand, "Thor::DynamicCommand"],
  [() => m9.Error, "Thor::Error"],
  [() => m9.ExclusiveArgumentError, "Thor::ExclusiveArgumentError"],
  [() => m10.Group, "Thor::Group"],
  [() => m7.HiddenCommand, "Thor::HiddenCommand"],
  [() => m11.Invocation, "Thor::Invocation"],
  [() => m11.ClassMethods, "Thor::Invocation::ClassMethods"],
  [() => m9.InvocationError, "Thor::InvocationError"],
  [() => m12.Basic, "Thor::LineEditor::Basic"],
  [() => m9.MalformattedArgumentError, "Thor::MalformattedArgumentError"],
  [() => m13.NestedContext, "Thor::NestedContext"],
  [() => m16.Option, "Thor::Option"],
  [() => m17.Options, "Thor::Options"],
  [() => m9.RequiredArgumentMissingError, "Thor::RequiredArgumentMissingError"],
  [() => m18.Shell, "Thor::Shell"],
  [() => m19.Basic, "Thor::Shell::Basic"],
  [() => m20.Color, "Thor::Shell::Color"],
  [() => m21.ColumnPrinter, "Thor::Shell::ColumnPrinter"],
  [() => m22.TablePrinter, "Thor::Shell::TablePrinter"],
  [() => m23.WrappedPrinter, "Thor::Shell::WrappedPrinter"],
  [() => m9.UndefinedCommandError, "Thor::UndefinedCommandError"],
  [() => m9.UnknownArgumentError, "Thor::UnknownArgumentError"],
]);
