import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class Database extends Construct {
  public meetingInfoTable: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.meetingInfoTable = new Table(this, 'meetingInfoTable', {
      partitionKey: {
        name: 'fromNumber',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'callId',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.meetingInfoTable.addGlobalSecondaryIndex({
      indexName: 'meetingIdIndex',
      partitionKey: {
        name: 'meetingId',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });
  }
}
