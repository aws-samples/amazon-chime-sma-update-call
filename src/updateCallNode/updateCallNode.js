const AWS = require('aws-sdk');
const chime = new AWS.Chime({ region: 'us-east-1', endpoint: 'service.chime.aws.amazon.com' });
var util = require('util')

const SMA_ID = process.env.SMA_ID

const response = {
    statusCode: 200,
    headers: {
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Content-Type": "application/json"
    },
    body: ""
};


async function updateCall(body) {
  console.log("TransactionId: ", body.transactionId)
  console.log("Body: ", body)
  var params = {
    SipMediaApplicationId: SMA_ID,
    TransactionId: body.transactionId,
    Arguments: { 
      "action": body.updateInfo 
    }
  };
  console.log("Params: ", params)
  try {
    const chimeResponse = await chime.updateSipMediaApplicationCall(params).promise()
    console.log(chimeResponse)
    console.log(util.inspect(chimeResponse,true,12,false))    
    return chimeResponse
  } catch (err) {
    console.log(err)
    return err
  }
};  

exports.handler = async (event, context) => {
  console.log(event)
  const body = JSON.parse(event.body)
  console.log(body)
  try {
    response.body = JSON.stringify(await updateCall(body))
    return response
  } catch (err) {
    return { error: err }
  }
}