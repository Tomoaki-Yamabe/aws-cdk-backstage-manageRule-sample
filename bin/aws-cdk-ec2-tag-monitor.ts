#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Ec2TagMonitorStack } from '../lib/ec2-tag-monitor-stack';


const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-1' };

// 必須タグの設定
const requiredTags = ['user_name'];

// SNS通知先のメールアドレス
const notificationEmail = 'tomoaki_yamabe@jp.honda';

new Ec2TagMonitorStack(app, 'Ec2TagMonitorStack', {
  env: env,
  requiredTags: requiredTags,
  notificationEmail: notificationEmail,
  description: 'Tag monitoring and notifications',
});

cdk.Tags.of(app).add('Project', 'EliteGen2');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('OwnerdBy', 'IDP');
