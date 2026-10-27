import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./attributes/attribute.js";
import * as m1 from "./collectors/bind.js";
import * as m2 from "./collectors/composite.js";
import * as m3 from "./collectors/plain-string.js";
import * as m4 from "./collectors/sql-string.js";
import * as m5 from "./collectors/substitute-binds.js";
import * as m6 from "./delete-manager.js";
import * as m7 from "./errors.js";
import * as m8 from "./insert-manager.js";
import * as m9 from "./nodes/ascending.js";
import * as m10 from "./nodes/binary.js";
import * as m11 from "./nodes/bind-param.js";
import * as m12 from "./nodes/bound-sql-literal.js";
import * as m13 from "./nodes/case.js";
import * as m14 from "./nodes/casted.js";
import * as m15 from "./nodes/comment.js";
import * as m16 from "./nodes/count.js";
import * as m17 from "./nodes/cte.js";
import * as m18 from "./nodes/delete-statement.js";
import * as m19 from "./nodes/descending.js";
import * as m20 from "./nodes/equality.js";
import * as m21 from "./nodes/extract.js";
import * as m22 from "./nodes/false.js";
import * as m23 from "./nodes/filter.js";
import * as m24 from "./nodes/fragments.js";
import * as m25 from "./nodes/full-outer-join.js";
import * as m26 from "./nodes/function.js";
import * as m27 from "./nodes/grouping.js";
import * as m28 from "./nodes/homogeneous-in.js";
import * as m29 from "./nodes/in.js";
import * as m30 from "./nodes/infix-operation.js";
import * as m31 from "./nodes/inner-join.js";
import * as m32 from "./nodes/insert-statement.js";
import * as m33 from "./nodes/join-source.js";
import * as m34 from "./nodes/leading-join.js";
import * as m35 from "./nodes/matches.js";
import * as m36 from "./nodes/named-function.js";
import * as m37 from "./nodes/nary.js";
import * as m38 from "./nodes/node-expression.js";
import * as m39 from "./nodes/node.js";
import * as m40 from "./nodes/ordering.js";
import * as m41 from "./nodes/outer-join.js";
import * as m42 from "./nodes/over.js";
import * as m43 from "./nodes/regexp.js";
import * as m44 from "./nodes/right-outer-join.js";
import * as m45 from "./nodes/select-core.js";
import * as m46 from "./nodes/select-statement.js";
import * as m47 from "./nodes/sql-literal.js";
import * as m48 from "./nodes/string-join.js";
import * as m49 from "./nodes/table-alias.js";
import * as m50 from "./nodes/terminal.js";
import * as m51 from "./nodes/true.js";
import * as m52 from "./nodes/unary-operation.js";
import * as m53 from "./nodes/unary.js";
import * as m54 from "./nodes/unqualified-column.js";
import * as m55 from "./nodes/update-statement.js";
import * as m56 from "./nodes/values-list.js";
import * as m57 from "./nodes/window.js";
import * as m58 from "./nodes/with.js";
import * as m59 from "./select-manager.js";
import * as m60 from "./table.js";
import * as m61 from "./tree-manager.js";
import * as m62 from "./update-manager.js";
import * as m63 from "./visitors/dot.js";
import * as m64 from "./visitors/mysql.js";
import * as m65 from "./visitors/postgresql.js";
import * as m66 from "./visitors/sqlite.js";
import * as m67 from "./visitors/to-sql.js";
import * as m68 from "./visitors/visitor.js";

registerClassPaths([
  [() => m7.ArelError, "Arel::ArelError"],
  [() => m0.Attribute, "Arel::Attributes::Attribute"],
  [() => m7.BindError, "Arel::BindError"],
  [() => m1.Bind, "Arel::Collectors::Bind"],
  [() => m2.Composite, "Arel::Collectors::Composite"],
  [() => m3.PlainString, "Arel::Collectors::PlainString"],
  [() => m4.SQLString, "Arel::Collectors::SQLString"],
  [() => m5.SubstituteBinds, "Arel::Collectors::SubstituteBinds"],
  [() => m6.DeleteManager, "Arel::DeleteManager"],
  [() => m7.EmptyJoinError, "Arel::EmptyJoinError"],
  [() => m8.InsertManager, "Arel::InsertManager"],
  [() => m30.Addition, "Arel::Nodes::Addition"],
  [() => m10.As, "Arel::Nodes::As"],
  [() => m9.Ascending, "Arel::Nodes::Ascending"],
  [() => m10.Assignment, "Arel::Nodes::Assignment"],
  [() => m26.Avg, "Arel::Nodes::Avg"],
  [() => m10.Between, "Arel::Nodes::Between"],
  [() => m53.Bin, "Arel::Nodes::Bin"],
  [() => m10.Binary, "Arel::Nodes::Binary"],
  [() => m11.BindParam, "Arel::Nodes::BindParam"],
  [() => m30.BitwiseAnd, "Arel::Nodes::BitwiseAnd"],
  [() => m52.BitwiseNot, "Arel::Nodes::BitwiseNot"],
  [() => m30.BitwiseOr, "Arel::Nodes::BitwiseOr"],
  [() => m30.BitwiseShiftLeft, "Arel::Nodes::BitwiseShiftLeft"],
  [() => m30.BitwiseShiftRight, "Arel::Nodes::BitwiseShiftRight"],
  [() => m30.BitwiseXor, "Arel::Nodes::BitwiseXor"],
  [() => m12.BoundSqlLiteral, "Arel::Nodes::BoundSqlLiteral"],
  [() => m13.Case, "Arel::Nodes::Case"],
  [() => m14.Casted, "Arel::Nodes::Casted"],
  [() => m15.Comment, "Arel::Nodes::Comment"],
  [() => m30.Concat, "Arel::Nodes::Concat"],
  [() => m30.Contains, "Arel::Nodes::Contains"],
  [() => m16.Count, "Arel::Nodes::Count"],
  [() => m17.Cte, "Arel::Nodes::Cte"],
  [() => m53.Cube, "Arel::Nodes::Cube"],
  [() => m57.CurrentRow, "Arel::Nodes::CurrentRow"],
  [() => m18.DeleteStatement, "Arel::Nodes::DeleteStatement"],
  [() => m19.Descending, "Arel::Nodes::Descending"],
  [() => m50.Distinct, "Arel::Nodes::Distinct"],
  [() => m53.DistinctOn, "Arel::Nodes::DistinctOn"],
  [() => m30.Division, "Arel::Nodes::Division"],
  [() => m35.DoesNotMatch, "Arel::Nodes::DoesNotMatch"],
  [() => m13.Else, "Arel::Nodes::Else"],
  [() => m20.Equality, "Arel::Nodes::Equality"],
  [() => m10.Except, "Arel::Nodes::Except"],
  [() => m26.Exists, "Arel::Nodes::Exists"],
  [() => m21.Extract, "Arel::Nodes::Extract"],
  [() => m22.False, "Arel::Nodes::False"],
  [() => m23.Filter, "Arel::Nodes::Filter"],
  [() => m57.Following, "Arel::Nodes::Following"],
  [() => m24.Fragments, "Arel::Nodes::Fragments"],
  [() => m25.FullOuterJoin, "Arel::Nodes::FullOuterJoin"],
  [() => m26.Function, "Arel::Nodes::Function"],
  [() => m10.GreaterThan, "Arel::Nodes::GreaterThan"],
  [() => m10.GreaterThanOrEqual, "Arel::Nodes::GreaterThanOrEqual"],
  [() => m53.Group, "Arel::Nodes::Group"],
  [() => m27.Grouping, "Arel::Nodes::Grouping"],
  [() => m53.GroupingElement, "Arel::Nodes::GroupingElement"],
  [() => m53.GroupingSet, "Arel::Nodes::GroupingSet"],
  [() => m28.HomogeneousIn, "Arel::Nodes::HomogeneousIn"],
  [() => m29.In, "Arel::Nodes::In"],
  [() => m30.InfixOperation, "Arel::Nodes::InfixOperation"],
  [() => m31.InnerJoin, "Arel::Nodes::InnerJoin"],
  [() => m32.InsertStatement, "Arel::Nodes::InsertStatement"],
  [() => m10.Intersect, "Arel::Nodes::Intersect"],
  [() => m10.IsDistinctFrom, "Arel::Nodes::IsDistinctFrom"],
  [() => m10.IsNotDistinctFrom, "Arel::Nodes::IsNotDistinctFrom"],
  [() => m10.Join, "Arel::Nodes::Join"],
  [() => m33.JoinSource, "Arel::Nodes::JoinSource"],
  [() => m53.Lateral, "Arel::Nodes::Lateral"],
  [() => m34.LeadingJoin, "Arel::Nodes::LeadingJoin"],
  [() => m10.LessThan, "Arel::Nodes::LessThan"],
  [() => m10.LessThanOrEqual, "Arel::Nodes::LessThanOrEqual"],
  [() => m53.Limit, "Arel::Nodes::Limit"],
  [() => m53.Lock, "Arel::Nodes::Lock"],
  [() => m35.Matches, "Arel::Nodes::Matches"],
  [() => m26.Max, "Arel::Nodes::Max"],
  [() => m26.Min, "Arel::Nodes::Min"],
  [() => m30.Multiplication, "Arel::Nodes::Multiplication"],
  [() => m36.NamedFunction, "Arel::Nodes::NamedFunction"],
  [() => m57.NamedWindow, "Arel::Nodes::NamedWindow"],
  [() => m37.Nary, "Arel::Nodes::Nary"],
  [() => m39.Node, "Arel::Nodes::Node"],
  [() => m38.NodeExpression, "Arel::Nodes::NodeExpression"],
  [() => m53.Not, "Arel::Nodes::Not"],
  [() => m10.NotEqual, "Arel::Nodes::NotEqual"],
  [() => m10.NotIn, "Arel::Nodes::NotIn"],
  [() => m43.NotRegexp, "Arel::Nodes::NotRegexp"],
  [() => m40.NullsFirst, "Arel::Nodes::NullsFirst"],
  [() => m40.NullsLast, "Arel::Nodes::NullsLast"],
  [() => m53.Offset, "Arel::Nodes::Offset"],
  [() => m53.On, "Arel::Nodes::On"],
  [() => m53.OptimizerHints, "Arel::Nodes::OptimizerHints"],
  [() => m40.Ordering, "Arel::Nodes::Ordering"],
  [() => m41.OuterJoin, "Arel::Nodes::OuterJoin"],
  [() => m42.Over, "Arel::Nodes::Over"],
  [() => m30.Overlaps, "Arel::Nodes::Overlaps"],
  [() => m57.Preceding, "Arel::Nodes::Preceding"],
  [() => m14.Quoted, "Arel::Nodes::Quoted"],
  [() => m57.Range, "Arel::Nodes::Range"],
  [() => m43.Regexp, "Arel::Nodes::Regexp"],
  [() => m44.RightOuterJoin, "Arel::Nodes::RightOuterJoin"],
  [() => m53.RollUp, "Arel::Nodes::RollUp"],
  [() => m57.Rows, "Arel::Nodes::Rows"],
  [() => m45.SelectCore, "Arel::Nodes::SelectCore"],
  [() => m46.SelectStatement, "Arel::Nodes::SelectStatement"],
  [() => m47.SqlLiteral, "Arel::Nodes::SqlLiteral"],
  [() => m48.StringJoin, "Arel::Nodes::StringJoin"],
  [() => m30.Subtraction, "Arel::Nodes::Subtraction"],
  [() => m26.Sum, "Arel::Nodes::Sum"],
  [() => m49.TableAlias, "Arel::Nodes::TableAlias"],
  [() => m51.True, "Arel::Nodes::True"],
  [() => m53.Unary, "Arel::Nodes::Unary"],
  [() => m52.UnaryOperation, "Arel::Nodes::UnaryOperation"],
  [() => m10.Union, "Arel::Nodes::Union"],
  [() => m10.UnionAll, "Arel::Nodes::UnionAll"],
  [() => m54.UnqualifiedColumn, "Arel::Nodes::UnqualifiedColumn"],
  [() => m55.UpdateStatement, "Arel::Nodes::UpdateStatement"],
  [() => m56.ValuesList, "Arel::Nodes::ValuesList"],
  [() => m13.When, "Arel::Nodes::When"],
  [() => m57.Window, "Arel::Nodes::Window"],
  [() => m58.With, "Arel::Nodes::With"],
  [() => m58.WithRecursive, "Arel::Nodes::WithRecursive"],
  [() => m59.SelectManager, "Arel::SelectManager"],
  [() => m60.Table, "Arel::Table"],
  [() => m61.TreeManager, "Arel::TreeManager"],
  [() => m62.UpdateManager, "Arel::UpdateManager"],
  [() => m63.Dot, "Arel::Visitors::Dot"],
  [() => m63.Edge, "Arel::Visitors::Dot::Edge"],
  [() => m63.Node, "Arel::Visitors::Dot::Node"],
  [() => m64.MySQL, "Arel::Visitors::MySQL"],
  [() => m65.PostgreSQL, "Arel::Visitors::PostgreSQL"],
  [() => m66.SQLite, "Arel::Visitors::SQLite"],
  [() => m67.ToSql, "Arel::Visitors::ToSql"],
  [() => m67.UnsupportedVisitError, "Arel::Visitors::UnsupportedVisitError"],
  [() => m68.Visitor, "Arel::Visitors::Visitor"],
]);
