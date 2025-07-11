
REGION="ap-northeast-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "AWS アカウント: $ACCOUNT_ID"
echo "デプロイリージョン: $REGION"

npm install

# project build
npm run build

# create Cfn for check
cdk synth

# cdk deploy
npx cdk deploy \
    --context region="$REGION" \
    --require-approval never

# setting check after deploy
CONFIG_RULE_NAME=$(aws cloudformation describe-stacks \
    --stack-name Ec2TagMonitorStack \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ConfigRuleName`].OutputValue' \
    --output text 2>/dev/null || echo "取得できませんでした")