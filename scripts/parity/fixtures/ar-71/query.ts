import { Book } from "./models.js";

// Rails: joins(:author, :reviews) — variadic single call.
// trails Relation#joins(assocName, on?) accepts only one association per call;
// passing a second string is treated as a raw ON clause, not a second assoc.
// Chaining is the correct workaround until joins() is made variadic.
export default Book.joins("author").joins("reviews");
