import { Duration, Stack, RemovalPolicy } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Effect, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as chime from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';

interface ChimeProps {
  meetingInfoTable: Table;
}

export class Chime extends Construct {
  public readonly meetingNumber: string;
  public readonly smaId: string;

  constructor(scope: Construct, id: string, props: ChimeProps) {
    super(scope, id);

    const outgoingWavBucket = new Bucket(this, 'outgoingWavBucket', {
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const outgoingWavBucketPolicy = new PolicyStatement({
      principals: [new ServicePrincipal('voiceconnector.chime.amazonaws.com')],
      effect: Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectAcl'],
      resources: [
        outgoingWavBucket.bucketArn,
        `${outgoingWavBucket.bucketArn}/*`,
      ],
      sid: 'SIPMediaApplicationRead',
    });

    outgoingWavBucket.addToResourcePolicy(outgoingWavBucketPolicy);

    new BucketDeployment(this, 'OutgoingWavBucketDeploy', {
      sources: [Source.asset('./wav_files')],
      destinationBucket: outgoingWavBucket,
      contentType: 'audio/wav',
    });

    const smaHandlerRole = new iam.Role(this, 'smaHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ['*'],
              actions: ['chime:*'],
            }),
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const smaHandlerLambda = new NodejsFunction(this, 'smaHandlerLambda', {
      entry: 'src/resources/smaHandler/smaHandler.js',
      bundling: {
        sourcesContent: true,
      },
      runtime: Runtime.NODEJS_16_X,
      role: smaHandlerRole,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(60),
      environment: {
        TABLE_NAME: props.meetingInfoTable.tableName,
        BUCKET_NAME: outgoingWavBucket.bucketName,
      },
    });

    props.meetingInfoTable.grantReadWriteData(smaHandlerLambda);

    const phoneNumber = new chime.ChimePhoneNumber(this, 'phoneNumber', {
      phoneState: 'IL',
      phoneNumberType: chime.PhoneNumberType.LOCAL,
      phoneProductType: chime.PhoneProductType.SMA,
    });

    const sipMediaApp = new chime.ChimeSipMediaApp(this, 'sipMediaApp', {
      region: Stack.of(this).region,
      endpoint: smaHandlerLambda.functionArn,
    });

    new chime.ChimeSipRule(this, 'sipRule', {
      triggerType: chime.TriggerType.TO_PHONE_NUMBER,
      triggerValue: phoneNumber.phoneNumber,
      targetApplications: [
        {
          region: Stack.of(this).region,
          priority: 1,
          sipMediaApplicationId: sipMediaApp.sipMediaAppId,
        },
      ],
    });

    this.meetingNumber = phoneNumber.phoneNumber;
    this.smaId = sipMediaApp.sipMediaAppId;
  }
}
