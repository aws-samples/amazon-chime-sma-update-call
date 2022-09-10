import { Duration } from 'aws-cdk-lib';
import {
  RestApi,
  LambdaIntegration,
  EndpointType,
  MethodLoggingLevel,
} from 'aws-cdk-lib/aws-apigateway';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

interface InfrastructureProps {
  meetingInfoTable: Table;
  smaID: string;
}
export class Infrastructure extends Construct {
  public apiUrl: string;

  constructor(scope: Construct, id: string, props: InfrastructureProps) {
    super(scope, id);
    const infrastructureRole = new Role(this, 'infrastructureRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['chime:*'],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const meetingLambda = new NodejsFunction(this, 'meetingLambda', {
      entry: 'src/resources/queryMeetings/queryMeetings.js',
      handler: 'handler',
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      role: infrastructureRole,
      timeout: Duration.seconds(60),
      environment: {
        MEETING_INFO: props.meetingInfoTable.tableName,
      },
    });

    props.meetingInfoTable.grantReadWriteData(meetingLambda);

    const updateCallRole = new Role(this, 'updateCallRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['chime:*'],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const updateCallNodeLambda = new NodejsFunction(
      this,
      'updateCallNodeLambda',
      {
        entry: 'src/resources/updateCallNode/updateCallNode.js',
        handler: 'handler',
        runtime: Runtime.NODEJS_16_X,
        environment: {
          SMA_ID: props.smaID,
        },
        role: updateCallRole,
      },
    );

    const updateCallPythonLambda = new Function(
      this,
      'updateCallPythonLambda',
      {
        code: Code.fromAsset('src/resources/updateCallPython'),
        handler: 'updateCall.lambda_handler',
        runtime: Runtime.PYTHON_3_9,
        environment: {
          SMA_ID: props.smaID,
        },
        role: updateCallRole,
      },
    );

    const api = new RestApi(this, 'ChimeSDKPSTNAudioUpdate', {
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'POST'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
      deployOptions: {
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });

    const updateCall = api.root.addResource('updateCallNode');
    const updateCallPython = api.root.addResource('updateCallPython');
    const queryMeetings = api.root.addResource('queryMeetings');

    const updateCallIntegration = new LambdaIntegration(updateCallNodeLambda);
    const updateCallPythonIntegration = new LambdaIntegration(
      updateCallPythonLambda,
    );
    const queryMeetingsIntegration = new LambdaIntegration(meetingLambda);

    updateCall.addMethod('POST', updateCallIntegration, {});
    updateCallPython.addMethod('POST', updateCallPythonIntegration, {});
    queryMeetings.addMethod('POST', queryMeetingsIntegration);

    this.apiUrl = api.url;
  }
}
