import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./channel/test-case.js";
import * as m1 from "./connection/test-case.js";

defineConstants([
  [() => m0.ChannelStub, "ActionCable::Channel::ChannelStub"],
  [() => m0.ConnectionStub, "ActionCable::Channel::ConnectionStub"],
  [() => m0.NonInferrableChannelError, "ActionCable::Channel::NonInferrableChannelError"],
  [() => m0.TestCase, "ActionCable::Channel::TestCase"],
  [() => m0.Behavior, "ActionCable::Channel::TestCase::Behavior"],
  [() => m0.ClassMethods, "ActionCable::Channel::TestCase::Behavior::ClassMethods"],
  [() => m1.Assertions, "ActionCable::Connection::Assertions"],
  [() => m1.NonInferrableConnectionError, "ActionCable::Connection::NonInferrableConnectionError"],
  [() => m1.TestCase, "ActionCable::Connection::TestCase"],
  [() => m1.Behavior, "ActionCable::Connection::TestCase::Behavior"],
  [() => m1.ClassMethods, "ActionCable::Connection::TestCase::Behavior::ClassMethods"],
  [() => m1.TestConnection, "ActionCable::Connection::TestConnection"],
  [() => m1.TestCookieJar, "ActionCable::Connection::TestCookieJar"],
  [() => m1.TestCookies, "ActionCable::Connection::TestCookies"],
  [() => m1.TestRequest, "ActionCable::Connection::TestRequest"],
]);
