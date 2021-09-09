import * as cdk from '@aws-cdk/core';
import s3 = require('@aws-cdk/aws-s3');
import dynamodb = require('@aws-cdk/aws-dynamodb');
import iam = require('@aws-cdk/aws-iam')
import lambda = require('@aws-cdk/aws-lambda');
import s3deploy = require('@aws-cdk/aws-s3-deployment')
import { PolicyStatement } from '@aws-cdk/aws-iam';
import custom = require('@aws-cdk/custom-resources')
import { CustomResource, Duration } from '@aws-cdk/core';
import apigateway = require('@aws-cdk/aws-apigateway'); 
import lambdanode = require ('@aws-cdk/aws-lambda-nodejs')


export class updateCallDemo extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const outgoingWav = new s3.Bucket(this, 'outgoingWav', {
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });
    
    const outboundWavBucketPolicy = new PolicyStatement({
      principals: [ new iam.ServicePrincipal('voiceconnector.chime.amazonaws.com')],
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:PutObjectAcl'
      ],
      resources: [
        outgoingWav.bucketArn,
        `${outgoingWav.bucketArn}/*`
      ],
      sid: 'SIPMediaApplicationRead',
    })

    outgoingWav.addToResourcePolicy(outboundWavBucketPolicy)

    new s3deploy.BucketDeployment(this, 'WavDeploy', {
      sources: [s3deploy.Source.asset('./wav_files')],
      destinationBucket: outgoingWav,
      contentType: 'audio/wav'
    });

    const meetingInfo = new dynamodb.Table(this, 'meetingInfo', {
      partitionKey: {
        name: 'fromNumber',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'callId',
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    meetingInfo.addGlobalSecondaryIndex({
      indexName: 'meetingIdIndex',
      partitionKey: {
        name: 'meetingId',
        type: dynamodb.AttributeType.STRING
      },
    projectionType: dynamodb.ProjectionType.ALL}
    )

    const smaLambdaRole = new iam.Role(this, 'smaLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument( { statements: [new iam.PolicyStatement({
          resources: ['*'],
          actions: ['chime:*']})]})
      },
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole") ]
    });

    const smaHandler = new lambda.Function(this, 'smaHandler', {
      code: lambda.Code.fromAsset("src/smaHandler"),
      handler: 'smaHandler.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        TABLE_NAME: meetingInfo.tableName,
        BUCKET_NAME: outgoingWav.bucketName
      },
      role: smaLambdaRole
    });

    meetingInfo.grantReadWriteData(smaHandler)

    const chimeCreateRole = new iam.Role(this, 'createChimeLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument( { statements: [new iam.PolicyStatement({
          resources: ['*'],
          actions: ['chime:*',
                    'lambda:GetPolicy',
                    'lambda:AddPermission']})]})
      },
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole") ]
    })

    const createSMALambda = new lambda.Function(this, 'createSMALambda', {
      code: lambda.Code.fromAsset("src/createChimeResources" ),
      handler: 'createChimeResources.on_event',
      runtime: lambda.Runtime.PYTHON_3_8,
      role: chimeCreateRole,
      timeout: Duration.seconds(60)
    });


    const chimeSMAProvider = new custom.Provider(this, 'chimeProvider', {
      onEventHandler: createSMALambda
    })

    const smaResources = new CustomResource(this, 'smaResources', { 
      serviceToken: chimeSMAProvider.serviceToken,
      properties: { 'lambdaArn': smaHandler.functionArn,
                    'region': this.region,
                    'smaName': this.stackName,
                    'phoneNumberRequired': true}
    })

    smaResources.node.addDependency(smaHandler)
    const smaPhoneNumber = smaResources.getAttString('phoneNumber')
    const smaID = smaResources.getAttString('smaID')
    new cdk.CfnOutput(this, 'smaPhoneNumber', { value: smaPhoneNumber });


    const updateCallRole = new iam.Role(this, 'outboundCallRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new iam.PolicyDocument( { statements: [new iam.PolicyStatement({
          resources: ['*'],
          actions: ['chime:*']})]})
      },
      managedPolicies: [ iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole") ]
    })

    const updateCallNodeLambda = new lambda.Function(this, 'updateCallNodeLambda', {
        code: lambda.Code.fromAsset("src/updateCallNode"),
        handler: 'updateCallNode.handler',
        runtime: lambda.Runtime.NODEJS_14_X,
        environment: {
          SMA_ID: smaID
        },
        role: updateCallRole
      });
  

    const updateCallPythonLambda = new lambda.Function(this, 'updateCallPythonLambda', {
      code: lambda.Code.fromAsset("src/updateCallPython"),
      handler: 'updateCall.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_8,
      environment: {
        SMA_ID: smaID
      },
      role: updateCallRole
    });

    const queryMeetingsLambda = new lambda.Function(this, 'queryMeetingsLambda', {
      code: lambda.Code.fromAsset("src/queryMeetings"),
      handler: 'queryMeetings.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        MEETING_INFO: meetingInfo.tableName
      }
    });

    meetingInfo.grantReadWriteData(queryMeetingsLambda)

    const api = new apigateway.RestApi(this, 'updateSMADemo', {
      endpointConfiguration: {
        types: [ apigateway.EndpointType.REGIONAL ]
      },
    });

    const updateCall = api.root.addResource('updateCallNode');
    const updateCallIntegration = new apigateway.LambdaIntegration(updateCallNodeLambda)
    updateCall.addMethod('POST', updateCallIntegration, {
      methodResponses: [{ statusCode: '200' }]
    });
    updateCall.addCorsPreflight({
      allowOrigins: [ '*' ],
      allowMethods: [ 'POST', 'OPTIONS' ]
    })

    const updateCallPython = api.root.addResource('updateCallPython');
    const updateCallPythonIntegration = new apigateway.LambdaIntegration(updateCallPythonLambda)
    updateCallPython.addMethod('POST', updateCallPythonIntegration, {
      methodResponses: [{ statusCode: '200' }]
    });
    updateCallPython.addCorsPreflight({
      allowOrigins: [ '*' ],
      allowMethods: [ 'POST', 'OPTIONS' ]
    })
    
    const queryMeetings = api.root.addResource('queryMeetings');
    const queryMeetingsIntegration = new apigateway.LambdaIntegration(queryMeetingsLambda)
    queryMeetings.addMethod('POST', queryMeetingsIntegration, {
      methodResponses: [{ statusCode: '200' }]
    });
    queryMeetings.addCorsPreflight({
      allowOrigins: [ '*' ],
      allowMethods: [ 'POST', 'OPTIONS' ]
    })

    new cdk.CfnOutput(this, 'updateCallApi', { value: api.url });
  }
}
