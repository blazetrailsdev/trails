import { registerClassPaths } from "./classpath.js";
import * as m0 from "./argument-error.js";
import * as m1 from "./encoding-error.js";
import * as m2 from "./eof-error.js";
import * as m3 from "./errno.js";
import * as m4 from "./exception.js";
import * as m5 from "./fiber-error.js";
import * as m6 from "./float-domain-error.js";
import * as m7 from "./frozen-error.js";
import * as m8 from "./hash.js";
import * as m9 from "./index-error.js";
import * as m10 from "./io-error.js";
import * as m11 from "./key-error.js";
import * as m12 from "./load-error.js";
import * as m13 from "./local-jump-error.js";
import * as m14 from "./name-error.js";
import * as m15 from "./no-method-error.js";
import * as m16 from "./not-implemented-error.js";
import * as m17 from "./range-error.js";
import * as m18 from "./range.js";
import * as m19 from "./rational.js";
import * as m20 from "./runtime-error.js";
import * as m21 from "./signal-exception.js";
import * as m22 from "./standard-error.js";
import * as m23 from "./stop-iteration.js";
import * as m24 from "./struct.js";
import * as m25 from "./thread-error.js";
import * as m26 from "./type-error.js";

registerClassPaths([
  [() => m0.ArgumentError, "ArgumentError"],
  [() => Array, "Array"],
  [() => m2.EOFError, "EOFError"],
  [() => m1.EncodingError, "EncodingError"],
  [() => m4.Exception, "Exception"],
  [() => m5.FiberError, "FiberError"],
  [() => m6.FloatDomainError, "FloatDomainError"],
  [() => m7.FrozenError, "FrozenError"],
  [() => m8.Hash, "Hash"],
  [() => m10.IOError, "IOError"],
  [() => m9.IndexError, "IndexError"],
  [() => m21.Interrupt, "Interrupt"],
  [() => m11.KeyError, "KeyError"],
  [() => m12.LoadError, "LoadError"],
  [() => m13.LocalJumpError, "LocalJumpError"],
  [() => m14.NameError, "NameError"],
  [() => m15.NoMethodError, "NoMethodError"],
  [() => m16.NotImplementedError, "NotImplementedError"],
  [() => Object, "Object"],
  [() => m18.Range, "Range"],
  [() => m17.RangeError, "RangeError"],
  [() => m19.Rational, "Rational"],
  [() => RegExp, "Regexp"],
  [() => m20.RuntimeError, "RuntimeError"],
  [() => m21.SignalException, "SignalException"],
  [() => m22.StandardError, "StandardError"],
  [() => m23.StopIteration, "StopIteration"],
  [() => m24.Struct, "Struct"],
  [() => m3.SystemCallError, "SystemCallError"],
  [() => m25.ThreadError, "ThreadError"],
  [() => m26.TypeError, "TypeError"],
  [() => m19.ZeroDivisionError, "ZeroDivisionError"],
]);
