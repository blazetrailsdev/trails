import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./alias-predication.js";
import * as m1 from "./attributes/attribute.js";
import * as m2 from "./collectors/bind.js";
import * as m3 from "./collectors/composite.js";
import * as m4 from "./collectors/plain-string.js";
import * as m5 from "./collectors/sql-string.js";
import * as m6 from "./collectors/substitute-binds.js";
import * as m7 from "./crud.js";
import * as m8 from "./delete-manager.js";
import * as m9 from "./errors.js";
import * as m10 from "./expressions.js";
import * as m11 from "./factory-methods.js";
import * as m12 from "./filter-predications.js";
import * as m13 from "./insert-manager.js";
import * as m14 from "./math.js";
import * as m15 from "./nodes/ascending.js";
import * as m16 from "./nodes/binary.js";
import * as m17 from "./nodes/bind-param.js";
import * as m18 from "./nodes/bound-sql-literal.js";
import * as m19 from "./nodes/case.js";
import * as m20 from "./nodes/casted.js";
import * as m21 from "./nodes/comment.js";
import * as m22 from "./nodes/count.js";
import * as m23 from "./nodes/cte.js";
import * as m24 from "./nodes/delete-statement.js";
import * as m25 from "./nodes/descending.js";
import * as m26 from "./nodes/equality.js";
import * as m27 from "./nodes/extract.js";
import * as m28 from "./nodes/false.js";
import * as m29 from "./nodes/filter.js";
import * as m30 from "./nodes/fragments.js";
import * as m31 from "./nodes/full-outer-join.js";
import * as m32 from "./nodes/function.js";
import * as m33 from "./nodes/grouping.js";
import * as m34 from "./nodes/homogeneous-in.js";
import * as m35 from "./nodes/in.js";
import * as m36 from "./nodes/infix-operation.js";
import * as m37 from "./nodes/inner-join.js";
import * as m38 from "./nodes/insert-statement.js";
import * as m39 from "./nodes/join-source.js";
import * as m40 from "./nodes/leading-join.js";
import * as m41 from "./nodes/matches.js";
import * as m42 from "./nodes/named-function.js";
import * as m43 from "./nodes/nary.js";
import * as m44 from "./nodes/node-expression.js";
import * as m45 from "./nodes/node.js";
import * as m46 from "./nodes/ordering.js";
import * as m47 from "./nodes/outer-join.js";
import * as m48 from "./nodes/over.js";
import * as m49 from "./nodes/regexp.js";
import * as m50 from "./nodes/right-outer-join.js";
import * as m51 from "./nodes/select-core.js";
import * as m52 from "./nodes/select-statement.js";
import * as m53 from "./nodes/sql-literal.js";
import * as m54 from "./nodes/string-join.js";
import * as m55 from "./nodes/table-alias.js";
import * as m56 from "./nodes/terminal.js";
import * as m57 from "./nodes/true.js";
import * as m58 from "./nodes/unary-operation.js";
import * as m59 from "./nodes/unary.js";
import * as m60 from "./nodes/unqualified-column.js";
import * as m61 from "./nodes/update-statement.js";
import * as m62 from "./nodes/values-list.js";
import * as m63 from "./nodes/window.js";
import * as m64 from "./nodes/with.js";
import * as m65 from "./order-predications.js";
import * as m66 from "./predications.js";
import * as m67 from "./select-manager.js";
import * as m68 from "./table.js";
import * as m69 from "./tree-manager.js";
import * as m70 from "./update-manager.js";
import * as m71 from "./visitors/dot.js";
import * as m72 from "./visitors/mysql.js";
import * as m73 from "./visitors/postgresql.js";
import * as m74 from "./visitors/sqlite.js";
import * as m75 from "./visitors/to-sql.js";
import * as m76 from "./visitors/visitor.js";
import * as m77 from "./window-predications.js";

registerClassPaths([
  [() => m0.AliasPredication, "Arel::AliasPredication"],
  [() => m9.ArelError, "Arel::ArelError"],
  [() => m1.Attribute, "Arel::Attributes::Attribute"],
  [() => m9.BindError, "Arel::BindError"],
  [() => m2.Bind, "Arel::Collectors::Bind"],
  [() => m3.Composite, "Arel::Collectors::Composite"],
  [() => m4.PlainString, "Arel::Collectors::PlainString"],
  [() => m5.SQLString, "Arel::Collectors::SQLString"],
  [() => m6.SubstituteBinds, "Arel::Collectors::SubstituteBinds"],
  [() => m7.Crud, "Arel::Crud"],
  [() => m8.DeleteManager, "Arel::DeleteManager"],
  [() => m9.EmptyJoinError, "Arel::EmptyJoinError"],
  [() => m10.Expressions, "Arel::Expressions"],
  [() => m11.FactoryMethods, "Arel::FactoryMethods"],
  [() => m12.FilterPredications, "Arel::FilterPredications"],
  [() => m13.InsertManager, "Arel::InsertManager"],
  [() => m14.Math, "Arel::Math"],
  [() => m36.Addition, "Arel::Nodes::Addition"],
  [() => m16.As, "Arel::Nodes::As"],
  [() => m15.Ascending, "Arel::Nodes::Ascending"],
  [() => m16.Assignment, "Arel::Nodes::Assignment"],
  [() => m32.Avg, "Arel::Nodes::Avg"],
  [() => m16.Between, "Arel::Nodes::Between"],
  [() => m59.Bin, "Arel::Nodes::Bin"],
  [() => m16.Binary, "Arel::Nodes::Binary"],
  [() => m17.BindParam, "Arel::Nodes::BindParam"],
  [() => m36.BitwiseAnd, "Arel::Nodes::BitwiseAnd"],
  [() => m58.BitwiseNot, "Arel::Nodes::BitwiseNot"],
  [() => m36.BitwiseOr, "Arel::Nodes::BitwiseOr"],
  [() => m36.BitwiseShiftLeft, "Arel::Nodes::BitwiseShiftLeft"],
  [() => m36.BitwiseShiftRight, "Arel::Nodes::BitwiseShiftRight"],
  [() => m36.BitwiseXor, "Arel::Nodes::BitwiseXor"],
  [() => m18.BoundSqlLiteral, "Arel::Nodes::BoundSqlLiteral"],
  [() => m19.Case, "Arel::Nodes::Case"],
  [() => m20.Casted, "Arel::Nodes::Casted"],
  [() => m21.Comment, "Arel::Nodes::Comment"],
  [() => m36.Concat, "Arel::Nodes::Concat"],
  [() => m36.Contains, "Arel::Nodes::Contains"],
  [() => m22.Count, "Arel::Nodes::Count"],
  [() => m23.Cte, "Arel::Nodes::Cte"],
  [() => m59.Cube, "Arel::Nodes::Cube"],
  [() => m63.CurrentRow, "Arel::Nodes::CurrentRow"],
  [() => m24.DeleteStatement, "Arel::Nodes::DeleteStatement"],
  [() => m25.Descending, "Arel::Nodes::Descending"],
  [() => m56.Distinct, "Arel::Nodes::Distinct"],
  [() => m59.DistinctOn, "Arel::Nodes::DistinctOn"],
  [() => m36.Division, "Arel::Nodes::Division"],
  [() => m41.DoesNotMatch, "Arel::Nodes::DoesNotMatch"],
  [() => m19.Else, "Arel::Nodes::Else"],
  [() => m26.Equality, "Arel::Nodes::Equality"],
  [() => m16.Except, "Arel::Nodes::Except"],
  [() => m32.Exists, "Arel::Nodes::Exists"],
  [() => m27.Extract, "Arel::Nodes::Extract"],
  [() => m28.False, "Arel::Nodes::False"],
  [() => m16.FetchAttribute, "Arel::Nodes::FetchAttribute"],
  [() => m29.Filter, "Arel::Nodes::Filter"],
  [() => m63.Following, "Arel::Nodes::Following"],
  [() => m30.Fragments, "Arel::Nodes::Fragments"],
  [() => m31.FullOuterJoin, "Arel::Nodes::FullOuterJoin"],
  [() => m32.Function, "Arel::Nodes::Function"],
  [() => m16.GreaterThan, "Arel::Nodes::GreaterThan"],
  [() => m16.GreaterThanOrEqual, "Arel::Nodes::GreaterThanOrEqual"],
  [() => m59.Group, "Arel::Nodes::Group"],
  [() => m33.Grouping, "Arel::Nodes::Grouping"],
  [() => m59.GroupingElement, "Arel::Nodes::GroupingElement"],
  [() => m59.GroupingSet, "Arel::Nodes::GroupingSet"],
  [() => m34.HomogeneousIn, "Arel::Nodes::HomogeneousIn"],
  [() => m35.In, "Arel::Nodes::In"],
  [() => m36.InfixOperation, "Arel::Nodes::InfixOperation"],
  [() => m37.InnerJoin, "Arel::Nodes::InnerJoin"],
  [() => m38.InsertStatement, "Arel::Nodes::InsertStatement"],
  [() => m16.Intersect, "Arel::Nodes::Intersect"],
  [() => m16.IsDistinctFrom, "Arel::Nodes::IsDistinctFrom"],
  [() => m16.IsNotDistinctFrom, "Arel::Nodes::IsNotDistinctFrom"],
  [() => m16.Join, "Arel::Nodes::Join"],
  [() => m39.JoinSource, "Arel::Nodes::JoinSource"],
  [() => m59.Lateral, "Arel::Nodes::Lateral"],
  [() => m40.LeadingJoin, "Arel::Nodes::LeadingJoin"],
  [() => m16.LessThan, "Arel::Nodes::LessThan"],
  [() => m16.LessThanOrEqual, "Arel::Nodes::LessThanOrEqual"],
  [() => m59.Limit, "Arel::Nodes::Limit"],
  [() => m59.Lock, "Arel::Nodes::Lock"],
  [() => m41.Matches, "Arel::Nodes::Matches"],
  [() => m32.Max, "Arel::Nodes::Max"],
  [() => m32.Min, "Arel::Nodes::Min"],
  [() => m36.Multiplication, "Arel::Nodes::Multiplication"],
  [() => m42.NamedFunction, "Arel::Nodes::NamedFunction"],
  [() => m63.NamedWindow, "Arel::Nodes::NamedWindow"],
  [() => m43.Nary, "Arel::Nodes::Nary"],
  [() => m45.Node, "Arel::Nodes::Node"],
  [() => m44.NodeExpression, "Arel::Nodes::NodeExpression"],
  [() => m59.Not, "Arel::Nodes::Not"],
  [() => m16.NotEqual, "Arel::Nodes::NotEqual"],
  [() => m16.NotIn, "Arel::Nodes::NotIn"],
  [() => m49.NotRegexp, "Arel::Nodes::NotRegexp"],
  [() => m46.NullsFirst, "Arel::Nodes::NullsFirst"],
  [() => m46.NullsLast, "Arel::Nodes::NullsLast"],
  [() => m59.Offset, "Arel::Nodes::Offset"],
  [() => m59.On, "Arel::Nodes::On"],
  [() => m59.OptimizerHints, "Arel::Nodes::OptimizerHints"],
  [() => m46.Ordering, "Arel::Nodes::Ordering"],
  [() => m47.OuterJoin, "Arel::Nodes::OuterJoin"],
  [() => m48.Over, "Arel::Nodes::Over"],
  [() => m36.Overlaps, "Arel::Nodes::Overlaps"],
  [() => m63.Preceding, "Arel::Nodes::Preceding"],
  [() => m20.Quoted, "Arel::Nodes::Quoted"],
  [() => m63.Range, "Arel::Nodes::Range"],
  [() => m49.Regexp, "Arel::Nodes::Regexp"],
  [() => m50.RightOuterJoin, "Arel::Nodes::RightOuterJoin"],
  [() => m59.RollUp, "Arel::Nodes::RollUp"],
  [() => m63.Rows, "Arel::Nodes::Rows"],
  [() => m51.SelectCore, "Arel::Nodes::SelectCore"],
  [() => m52.SelectStatement, "Arel::Nodes::SelectStatement"],
  [() => m53.SqlLiteral, "Arel::Nodes::SqlLiteral"],
  [() => m54.StringJoin, "Arel::Nodes::StringJoin"],
  [() => m36.Subtraction, "Arel::Nodes::Subtraction"],
  [() => m32.Sum, "Arel::Nodes::Sum"],
  [() => m55.TableAlias, "Arel::Nodes::TableAlias"],
  [() => m57.True, "Arel::Nodes::True"],
  [() => m59.Unary, "Arel::Nodes::Unary"],
  [() => m58.UnaryOperation, "Arel::Nodes::UnaryOperation"],
  [() => m16.Union, "Arel::Nodes::Union"],
  [() => m16.UnionAll, "Arel::Nodes::UnionAll"],
  [() => m60.UnqualifiedColumn, "Arel::Nodes::UnqualifiedColumn"],
  [() => m61.UpdateStatement, "Arel::Nodes::UpdateStatement"],
  [() => m62.ValuesList, "Arel::Nodes::ValuesList"],
  [() => m19.When, "Arel::Nodes::When"],
  [() => m63.Window, "Arel::Nodes::Window"],
  [() => m64.With, "Arel::Nodes::With"],
  [() => m64.WithRecursive, "Arel::Nodes::WithRecursive"],
  [() => m65.OrderPredications, "Arel::OrderPredications"],
  [() => m66.Predications, "Arel::Predications"],
  [() => m67.SelectManager, "Arel::SelectManager"],
  [() => m68.Table, "Arel::Table"],
  [() => m69.TreeManager, "Arel::TreeManager"],
  [() => m69.StatementMethods, "Arel::TreeManager::StatementMethods"],
  [() => m70.UpdateManager, "Arel::UpdateManager"],
  [() => m71.Dot, "Arel::Visitors::Dot"],
  [() => m71.Edge, "Arel::Visitors::Dot::Edge"],
  [() => m71.Node, "Arel::Visitors::Dot::Node"],
  [() => m72.MySQL, "Arel::Visitors::MySQL"],
  [() => m73.PostgreSQL, "Arel::Visitors::PostgreSQL"],
  [() => m74.SQLite, "Arel::Visitors::SQLite"],
  [() => m75.ToSql, "Arel::Visitors::ToSql"],
  [() => m75.UnsupportedVisitError, "Arel::Visitors::UnsupportedVisitError"],
  [() => m76.Visitor, "Arel::Visitors::Visitor"],
  [() => m77.WindowPredications, "Arel::WindowPredications"],
]);
