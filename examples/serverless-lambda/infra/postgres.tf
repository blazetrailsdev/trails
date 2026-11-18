data "aws_vpc" "default" {
  count   = var.postgres ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = var.postgres ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
}

resource "aws_security_group" "function" {
  count       = var.postgres ? 1 : 0
  name        = "${var.name}-fn"
  description = "trails lambda function"
  vpc_id      = data.aws_vpc.default[0].id
}

resource "aws_security_group" "db" {
  count       = var.postgres ? 1 : 0
  name        = "${var.name}-db"
  description = "trails lambda postgres"
  vpc_id      = data.aws_vpc.default[0].id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_function" {
  count                        = var.postgres ? 1 : 0
  security_group_id            = aws_security_group.db[0].id
  referenced_security_group_id = aws_security_group.function[0].id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "random_password" "db" {
  count   = var.postgres ? 1 : 0
  length  = 40
  special = false
}

resource "aws_db_instance" "pg" {
  count                   = var.postgres ? 1 : 0
  identifier              = "${var.name}-pg"
  engine                  = "postgres"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  db_name                 = "trails"
  username                = "trails"
  password                = random_password.db[0].result
  vpc_security_group_ids  = [aws_security_group.db[0].id]
  publicly_accessible     = false
  backup_retention_period = 0
  skip_final_snapshot     = true
}
