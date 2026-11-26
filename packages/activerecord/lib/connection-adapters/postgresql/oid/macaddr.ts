import "../../../constants.postgresql-oid-macaddr.generated.js";
import { ConnectionAdapters } from "../../../namespaces.js";
import { casecmp } from "@blazetrails/ruby-compat/string/case-mapping";
import { rbObjClass, rtest } from "@blazetrails/ruby-compat/object";
import { StringType } from "@blazetrails/activemodel";

export class Macaddr extends StringType {
  override type(): string {
    return "macaddr";
  }

  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    return (
      rbObjClass(oldValue) !== rbObjClass(newValue) ||
      (rtest(newValue) && casecmp(oldValue as string, newValue) !== 0)
    );
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return (
      rbObjClass(rawOldValue) !== rbObjClass(newValue) ||
      (rtest(newValue) && casecmp(rawOldValue as string, newValue) !== 0)
    );
  }
}

ConnectionAdapters.PostgreSQL.OID.Macaddr = Macaddr;
