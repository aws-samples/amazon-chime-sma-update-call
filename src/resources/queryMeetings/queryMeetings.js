const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.MEETING_INFO;

var params = {
  TableName: TABLE_NAME,
  IndexName: 'meetingIdIndex',
};

const response = {
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json',
  },
  body: '',
};

async function scanItems() {
  try {
    const data = await docClient.scan(params).promise();
    console.log(data);
    return data;
  } catch (err) {
    console.log(err);
    return err;
  }
}

exports.handler = async (event, context) => {
  console.log(event);
  try {
    response.body = JSON.stringify(await scanItems());
    console.log(JSON.stringify(response));
    return response;
  } catch (err) {
    console.log(err);
    return { error: err };
  }
};
