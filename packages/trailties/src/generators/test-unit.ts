import { NamedBase } from "./named-base.js";

export class Base extends NamedBase {}

Object.defineProperty(Base, "name", { value: "TestUnit::Generators::Base" });
