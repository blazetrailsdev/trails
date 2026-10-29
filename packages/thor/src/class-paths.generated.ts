import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./actions.js";
import * as m1 from "./actions/create-file.js";
import * as m2 from "./actions/create-link.js";
import * as m3 from "./actions/directory.js";
import * as m4 from "./actions/empty-directory.js";
import * as m5 from "./actions/file-manipulation.js";
import * as m6 from "./actions/inject-into-file.js";
import * as m7 from "./base.js";
import * as m8 from "./command.js";
import * as m9 from "./core-ext/hash-with-indifferent-access.js";
import * as m10 from "./error.js";
import * as m11 from "./group.js";
import * as m12 from "./invocation.js";
import * as m13 from "./line-editor/basic.js";
import * as m14 from "./nested-context.js";
import * as m15 from "./parser/argument.js";
import * as m16 from "./parser/arguments.js";
import * as m17 from "./parser/option.js";
import * as m18 from "./parser/options.js";
import * as m19 from "./shell.js";
import * as m20 from "./shell/basic.js";
import * as m21 from "./shell/color.js";
import * as m22 from "./shell/column-printer.js";
import * as m23 from "./shell/table-printer.js";
import * as m24 from "./shell/wrapped-printer.js";

registerClassPaths([
  [() => m0.Actions, "Thor::Actions"],
  [() => m5.CapturableERB, "Thor::Actions::CapturableERB"],
  [() => m0.ClassMethods, "Thor::Actions::ClassMethods"],
  [() => m1.CreateFile, "Thor::Actions::CreateFile"],
  [() => m2.CreateLink, "Thor::Actions::CreateLink"],
  [() => m3.Directory, "Thor::Actions::Directory"],
  [() => m4.EmptyDirectory, "Thor::Actions::EmptyDirectory"],
  [() => m6.InjectIntoFile, "Thor::Actions::InjectIntoFile"],
  [() => m10.AmbiguousCommandError, "Thor::AmbiguousCommandError"],
  [() => m15.Argument, "Thor::Argument"],
  [() => m16.Arguments, "Thor::Arguments"],
  [() => m10.AtLeastOneRequiredArgumentError, "Thor::AtLeastOneRequiredArgumentError"],
  [() => m7.Base, "Thor::Base"],
  [() => m7.ClassMethods, "Thor::Base::ClassMethods"],
  [() => m8.Command, "Thor::Command"],
  [() => m9.CoreExt, "Thor::CoreExt"],
  [() => m9.HashWithIndifferentAccess, "Thor::CoreExt::HashWithIndifferentAccess"],
  [() => m8.DynamicCommand, "Thor::DynamicCommand"],
  [() => m10.Error, "Thor::Error"],
  [() => m10.ExclusiveArgumentError, "Thor::ExclusiveArgumentError"],
  [() => m11.Group, "Thor::Group"],
  [() => m8.HiddenCommand, "Thor::HiddenCommand"],
  [() => m12.Invocation, "Thor::Invocation"],
  [() => m12.ClassMethods, "Thor::Invocation::ClassMethods"],
  [() => m10.InvocationError, "Thor::InvocationError"],
  [() => m13.Basic, "Thor::LineEditor::Basic"],
  [() => m10.MalformattedArgumentError, "Thor::MalformattedArgumentError"],
  [() => m14.NestedContext, "Thor::NestedContext"],
  [() => m17.Option, "Thor::Option"],
  [() => m18.Options, "Thor::Options"],
  [() => m10.RequiredArgumentMissingError, "Thor::RequiredArgumentMissingError"],
  [() => m19.Shell, "Thor::Shell"],
  [() => m20.Basic, "Thor::Shell::Basic"],
  [() => m21.Color, "Thor::Shell::Color"],
  [() => m22.ColumnPrinter, "Thor::Shell::ColumnPrinter"],
  [() => m23.TablePrinter, "Thor::Shell::TablePrinter"],
  [() => m24.WrappedPrinter, "Thor::Shell::WrappedPrinter"],
  [() => m10.UndefinedCommandError, "Thor::UndefinedCommandError"],
  [() => m10.UnknownArgumentError, "Thor::UnknownArgumentError"],
]);
