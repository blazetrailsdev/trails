#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
FN=${FUNCTION_NAME:-trails-serverless-lambda}
ENV='Variables={TRAILS_ENV=production,SQLITE_PATH=/tmp/spike.sqlite3,SPIKE_DB_SEED=db/spike.sqlite3}'
if [ -n "${PGHOST:-}" ]; then
  ENV="Variables={TRAILS_ENV=production,PGHOST=$PGHOST,PGUSER=$PGUSER,PGPASSWORD=$PGPASSWORD,PGDATABASE=${PGDATABASE:-trails}}"
fi
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file fileb://build/lambda.zip --query LastModified --output text
  aws lambda wait function-updated-v2 --function-name "$FN"
  VPC_ARGS=()
  [ -n "${VPC_SUBNETS:-}" ] && VPC_ARGS=(--vpc-config "SubnetIds=$VPC_SUBNETS,SecurityGroupIds=$VPC_SECURITY_GROUP")
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENV" "${VPC_ARGS[@]}" --query LastUpdateStatus --output text
  aws lambda wait function-updated-v2 --function-name "$FN"
else
  : "${LAMBDA_ROLE_ARN:?set LAMBDA_ROLE_ARN to a role Lambda can assume (AWSLambdaBasicExecutionRole is enough)}"
  aws lambda create-function --function-name "$FN" --runtime nodejs26.x --architectures arm64 \
    --memory-size "${MEMORY:-1024}" --timeout 15 --role "$LAMBDA_ROLE_ARN" --handler handler.handler \
    --zip-file fileb://build/lambda.zip --environment "$ENV" --query FunctionArn --output text
  aws lambda wait function-active-v2 --function-name "$FN"
  aws lambda create-function-url-config --function-name "$FN" --auth-type NONE --query FunctionUrl --output text
  aws lambda add-permission --function-name "$FN" --statement-id public-url --action lambda:InvokeFunctionUrl \
    --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FN" --statement-id public-url-invoke --action lambda:InvokeFunction \
    --principal '*' >/dev/null 2>&1 || true
fi
aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text
