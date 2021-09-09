import boto3
import os
import json
chime = boto3.client('chime')

SMA_ID = os.environ['SMA_ID']

response = {
    "statusCode": 200,
    "headers": {
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Content-Type": "application/json"
    },
    "body": ""
};

def updateCall(body):
    chimeResponse = chime.update_sip_media_application_call(
        SipMediaApplicationId=SMA_ID,
        TransactionId=body.get('transactionId'),
        Arguments={
            "action": body.get('updateInfo')
        }
    )
    return chimeResponse


def lambda_handler(event, context):
    print(event)
    body = json.loads(event.get('body'))
    print(body)
    response['body'] = json.dumps(updateCall(body))
    return response
    
