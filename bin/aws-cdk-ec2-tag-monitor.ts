#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Ec2TagMonitorStack } from '../lib/ec2-tag-monitor-stack';


const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-1' };

// Nesessury workbench tags
const requiredTags = app.node.tryGetContext('requiredTags') || ['Environment', 'Owner', 'Project'];

// SNS Send Target mail address
const notificationEmail = app.node.tryGetContext('notificationEmail') || ['tomoaki_yamabe@jp.honda', 'shuhei_nakayama_gst@jp.honda'];

new Ec2TagMonitorStack(app, 'Ec2TagMonitorStack', {
  env: env,
  requiredTags: requiredTags,
  notificationEmail: notificationEmail,
  description: 'Tag monitoring and notifications',
});

cdk.Tags.of(app).add('Project', 'EC2TagMonitor');
cdk.Tags.of(app).add('Environment', 'Production');
cdk.Tags.of(app).add('ManagedBy', 'CDK');