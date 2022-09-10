import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Site, Infrastructure, Chime, Database } from './index';

export class AmazonChimeUpdateCall extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const database = new Database(this, 'Database');

    const chime = new Chime(this, 'Chime', {
      meetingInfoTable: database.meetingInfoTable,
    });
    const infrastructure = new Infrastructure(this, 'infrastructure', {
      meetingInfoTable: database.meetingInfoTable,
      smaID: chime.smaId,
    });

    const site = new Site(this, 'Site', {
      apiUrl: infrastructure.apiUrl,
    });

    new CfnOutput(this, 'distribution', {
      value: site.distribution.domainName,
    });

    new CfnOutput(this, 'siteBucket', { value: site.siteBucket.bucketName });

    new CfnOutput(this, 'meetingNumber', { value: chime.meetingNumber });
  }
}
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new AmazonChimeUpdateCall(app, 'AmazonChimeUpdateCall', {
  env: devEnv,
});

app.synth();
