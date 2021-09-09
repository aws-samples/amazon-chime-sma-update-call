#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { updateCallDemo } from '../lib/updateCallDemo';

const app = new cdk.App();

new updateCallDemo(app, 'updateCallDemo');

