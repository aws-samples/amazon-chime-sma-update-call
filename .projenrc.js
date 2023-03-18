const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.40.0',
  defaultReleaseBranch: 'main',
  name: 'amazon-chime-sma-update-call',
  deps: ['fs-extra', '@types/fs-extra', 'cdk-amazon-chime-resources'],
  appEntrypoint: 'amazon-chime-sma-update-call.ts',
  devDeps: ['esbuild'],
  workflowNodeVersion: '16.x',
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['schuettc'],
  },
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
    },
  },
  scripts: {
    launch:
      'yarn && yarn projen && yarn build && yarn cdk bootstrap && yarn cdk deploy --hotswap && yarn configLocal',
  },
});

const common_exclude = [
  'cdk.out',
  'cdk.context.json',
  'yarn-error.log',
  'dependabot.yml',
  '*.drawio',
  '.DS_Store',
];

project.addTask('getBucket', {
  exec: "aws cloudformation describe-stacks --stack-name AmazonChimeUpdateCall --query 'Stacks[0].Outputs[?OutputKey==`siteBucket`].OutputValue' --output text",
});

project.addTask('configLocal', {
  exec: 'aws s3 cp s3://$(yarn run --silent getBucket)/config.json site/public/',
});

project.gitignore.exclude(...common_exclude);
project.synth();
