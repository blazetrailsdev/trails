import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./file-utils-ext.js";
import * as m1 from "./invocation-chain.js";
import * as m2 from "./invocation-exception-mixin.js";
import * as m3 from "./linked-list.js";
import * as m4 from "./pseudo-status.js";
import * as m5 from "./rule-recursion-overflow-error.js";
import * as m6 from "./task-argument-error.js";
import * as m7 from "./task-arguments.js";
import * as m8 from "./task.js";
import * as m9 from "./version.js";

registerClassPaths([
  [() => m0.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m1.InvocationChain, "Rake::InvocationChain"],
  [() => m2.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m3.LinkedList, "Rake::LinkedList"],
  [() => m4.PseudoStatus, "Rake::PseudoStatus"],
  [() => m5.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m8.Task, "Rake::Task"],
  [() => m6.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m7.TaskArguments, "Rake::TaskArguments"],
  [() => m9.Version, "Rake::Version"],
]);
