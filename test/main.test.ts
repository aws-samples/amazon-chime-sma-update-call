import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AmazonChimeUpdateCall } from '../src/amazon-chime-sma-update-call';

test('Snapshot', () => {
  const app = new App();
  const stack = new AmazonChimeUpdateCall(app, 'test');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
