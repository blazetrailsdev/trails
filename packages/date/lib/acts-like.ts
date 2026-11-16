import { TEMPORAL_METHOD_TABLE } from "@blazetrails/ruby-compat";

const actsLikeTrue = () => true;
Object.assign(TEMPORAL_METHOD_TABLE["Temporal.PlainDate"], { actsLikeDate: actsLikeTrue });
for (const seat of ["Temporal.PlainDateTime", "Temporal.ZonedDateTime"]) {
  Object.assign(TEMPORAL_METHOD_TABLE[seat], {
    actsLikeDate: actsLikeTrue,
    actsLikeTime: actsLikeTrue,
  });
}
for (const seat of ["Temporal.Instant", "Date"]) {
  (TEMPORAL_METHOD_TABLE[seat] ??= {}).actsLikeTime = actsLikeTrue;
}
