import * as cdk from 'aws-cdk-lib';
import * as config from 'aws-cdk-lib/aws-config';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface Ec2TagMonitorStackProps extends cdk.StackProps {
  requiredTags: string[];
  notificationEmail: string;
}

export class Ec2TagMonitorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Ec2TagMonitorStackProps) {
    super(scope, id, props);


    // --------------- SNS --------------- //

    // Create SNS Topic
    const notificationTopic = new sns.Topic(this, 'Ec2TagViolationTopic', {
      topicName: 'ec2-tag-compliance-notifications',
      displayName: 'EC2 Tag Compliance Notifications',
    });

    // メール通知の設定 - CfnSubscriptionを直接使用してIDの問題を回避
    new sns.CfnSubscription(this, 'EmailSubscription', {
      topicArn: notificationTopic.topicArn,
      protocol: 'email',
      endpoint: props.notificationEmail,
    });


    // --------------- AWS Config --------------- //
   
    // ### config preparation
    
    // AWS Config管理ルール: required-tags（既存のConfig設定を利用）
    const requiredTagsRule = new config.ManagedRule(this, 'RequiredTagsRule', {
      configRuleName: 'RequiredEc2TagsRule', // 明示的なルール名を設定
      identifier: config.ManagedRuleIdentifiers.REQUIRED_TAGS,
      inputParameters: this.createRequiredTagsParameters(props.requiredTags),
      description: `EC2インスタンスに必須タグ [${props.requiredTags.join(', ')}] が設定されているかチェック`,
    });


    // --------------- Event Bridge  --------------- //

    // ## Base Rule
    // EventBridge: Rule
    const configComplianceRule = new events.Rule(this, 'ConfigComplianceRule', {
      ruleName: 'ec2-tag-team-compliance-monitor',
      description: 'AWS Config EC2チームタグが付与されているかを監視',
      eventPattern: {
        source: ['aws.config'],
        detailType: ['Config Rules Compliance Change'],
        detail: {
          configRuleName: ['RequiredEc2TagsRule'], // 明示的なルール名を使用
          newEvaluationResult: {
            complianceType: ['NON_COMPLIANT'], // from AWS Config
          },
          resourceType: ['AWS::EC2::Instance'],
        },
      },
    });

    // EventBridge: Target (setting send information)
    configComplianceRule.addTarget(
      new targets.SnsTopic(notificationTopic, {
        message: events.RuleTargetInput.fromText(
          `【AWS Config】EC2インスタンスのタグコンプライアンス違反が検出されました

■ 詳細情報
- 検出時刻: ${events.EventField.fromPath('$.time')}
- リージョン: ${events.EventField.fromPath('$.detail.awsRegion')}
- アカウント: ${events.EventField.fromPath('$.detail.awsAccountId')}
- リソースID: ${events.EventField.fromPath('$.detail.resourceId')}
- リソースタイプ: ${events.EventField.fromPath('$.detail.resourceType')}
- Config ルール: ${events.EventField.fromPath('$.detail.configRuleName')}
- コンプライアンス状態: ${events.EventField.fromPath('$.detail.newEvaluationResult.complianceType')}

■ 対応が必要な事項
1. 該当のEC2インスタンスに必須タグ「user_name」を追加してください
2. 今後のインスタンス起動時は必須タグを設定してください
3. タグ付けポリシーの遵守を確認してください

■ AWS Console リンク
- EC2 Console: https://console.aws.amazon.com/ec2/v2/home?region=${events.EventField.fromPath('$.detail.awsRegion')}#Instances:instanceId=${events.EventField.fromPath('$.detail.resourceId')}
- Config Console: https://console.aws.amazon.com/config/home?region=${events.EventField.fromPath('$.detail.awsRegion')}#/rules/details?configRuleName=${events.EventField.fromPath('$.detail.configRuleName')}

このメッセージは AWS Config による自動監視システムから送信されています。`
        ),
      })
    );



    // ## Schedule EventBridge Rule
    const scheduledComplianceCheck = new events.Rule(this, 'ScheduledComplianceCheck', {
      ruleName: 'ec2-tag-scheduled-team-compliance-check',
      description: '定期的なEC2タグコンプライアンスチェック',
      schedule: events.Schedule.rate(cdk.Duration.hours(12)),
    });

    // AWS Config ルールの再評価をトリガー
    scheduledComplianceCheck.addTarget(
      new targets.AwsApi({
        service: 'ConfigService',
        action: 'startConfigRulesEvaluation',
        parameters: {
          ConfigRuleNames: ['RequiredEc2TagsRule'],
        },
      })
    );



    // EventBridge用のIAMロール
    const eventBridgeRole = new iam.Role(this, 'EventBridgeRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        ConfigEvaluationPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'config:StartConfigRulesEvaluation',
              ],
              resources: [
                `arn:aws:config:${this.region}:${this.account}:config-rule/RequiredEc2TagsRule`,
              ],
            }),
          ],
        }),
      },
    });

    // 定期チェックルールにロールを設定
    const cfnScheduledRule = scheduledComplianceCheck.node.defaultChild as events.CfnRule;
    cfnScheduledRule.addPropertyOverride('Targets.0.RoleArn', eventBridgeRole.roleArn);


    // CloudFormation Export ( check management console or use other Cfn )
    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: notificationTopic.topicArn,
      description: 'SNS Topic ARN for EC2 tag compliance notifications',
    });

    new cdk.CfnOutput(this, 'ConfigRuleName', {
      value: requiredTagsRule.configRuleName,
      description: 'AWS Config rule name for required tags',
    });


    new cdk.CfnOutput(this, 'RequiredTags', {
      value: JSON.stringify(props.requiredTags),
      description: 'List of required tags for EC2 instances',
    });

    new cdk.CfnOutput(this, 'NotificationEmail', {
      value: props.notificationEmail,
      description: 'Email address for compliance notifications',
    });
  }



  /**
   * 必須タグのパラメータを作成（最大6つまで）
   */
  private createRequiredTagsParameters(requiredTags: string[]): { [key: string]: any } {
    const parameters: { [key: string]: any } = {};
    
    // AWS Config required-tags ルールは最大6つのタグまでサポート
    const maxTags = Math.min(requiredTags.length, 6);
    
    for (let i = 0; i < maxTags; i++) {
      const tagNumber = i + 1;
      parameters[`tag${tagNumber}Key`] = requiredTags[i];
      // タグの値は必須ではないため、キーのみを指定
    }
    
    return parameters;
  }

}