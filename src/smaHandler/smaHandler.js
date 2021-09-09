const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB({ region: process.env.AWS_REGION });
const chime = new AWS.Chime({ region: 'us-east-1', endpoint: 'service.chime.aws.amazon.com' });

exports.handler = async(event, context, callback) => {
    console.log("Lambda is invoked with calldetails:" + JSON.stringify(event));
    let actions;

    switch (event.InvocationEventType) {
        case "NEW_INBOUND_CALL":
            console.log("INBOUND");
            // New inbound call
            actions = await newCall(event);
            break;

        case "DIGITS_RECEIVED":
            console.log("RECEIVED DIGITS ACTIONS");
            // In-Call DTMF (digtis) detected
            actions = await receivedDigits(event);
            break;

        case "ACTION_SUCCESSFUL":
            // Action from the previous invocation response 
            // or a action requiring callback was successful
            console.log("SUCCESS ACTION");
            actions = await actionSuccessful(event);
            break;

        case "CALL_UPDATE_REQUESTED":
            // Action from external source to update call
            console.log("CALL UPDATE REQUEST")
            actions = await updateAction(event);
            break;

        case "HANGUP":
            // Hangup received
            console.log("HANGUP ACTION");
            if (event.CallDetails.Participants[0].Status === "Disconnected") {
                await deleteAttendee(event);
            }
            actions = [];
            break;

        default:
            // Action unsuccessful or unknown event recieved
            console.log("FAILED ACTION");
            actions = [hangupAction];
    }

    const response = {
        "SchemaVersion": "1.0",
        "Actions": actions
    };

    console.log("Sending response:" + JSON.stringify(response));

    callback(null, response);
}

// New call handler
async function newCall(event) {
    // Play a welcome message after answering the call, play a prompt and gather DTMF tones
    playAudioAction.Parameters.AudioSource.Key = "welcome-message.wav";
    return [pauseAction, playAudioAction, playAudioAndGetDigitsAction];
}

// New call handler
async function receivedDigits(event) {
    // Last action was ReceiveDigits
    const fromNumber = event.CallDetails.Participants[0].From;
    const callId = event.CallDetails.Participants[0].CallId;

    switch (event.ActionData.ReceivedDigits) {
        case "*5":
            // Mute all
            var meeting = await getMeetingInfo(fromNumber, callId);

            var mapAttendee = meeting
                .filter(meeting => meeting.callId.S !== event.CallDetails.Participants[0].CallId)
                .map(meeting => meeting.attendeeId.S);

            if (mapAttendee.length != 0) {
                muteAttendeesAction.Parameters.MeetingId = meeting[0].meetingId.S;
                muteAttendeesAction.Parameters.AttendeeList = mapAttendee;

                return [muteAttendeesAction];
            }

            // no other attendee nothing to do
            return [];

        case "*6":
            // Unmute all
            var meeting = await getMeetingInfo(fromNumber, callId);

            var mapAttendee = meeting
                .filter(meeting => meeting.callId.S !== event.CallDetails.Participants[0].CallId)
                .map(meeting => meeting.attendeeId.S);

            if (mapAttendee.length != 0) {
                unmuteAttendeesAction.Parameters.MeetingId = meeting[0].meetingId.S;
                unmuteAttendeesAction.Parameters.AttendeeList = mapAttendee;

                return [unmuteAttendeesAction];
            }

            // no other attendee nothing to do
            return [];

        case "*7":
            // Mute
            var attendee = await getAttendeeInfo(fromNumber, callId);

            muteAttendeesAction.Parameters.MeetingId = attendee[0].meetingId.S;
            muteAttendeesAction.Parameters.AttendeeList = [attendee[0].attendeeId.S];

            return [muteAttendeesAction];

        case "*8":
            // Unmute
            var attendee = await getAttendeeInfo(fromNumber, callId);

            unmuteAttendeesAction.Parameters.MeetingId = attendee[0].meetingId.S;
            unmuteAttendeesAction.Parameters.AttendeeList = [attendee[0].attendeeId.S];

            return [unmuteAttendeesAction];

        default:
            return [];
    }
}

// Action successful handler
async function actionSuccessful(event) {
    console.log("ACTION_SUCCESSFUL");
    
    const fromNumber = event.CallDetails.Participants[0].From;
    const callId = event.CallDetails.Participants[0].CallId;
    
    switch (event.ActionData.Type) {
        case "PlayAudioAndGetDigits":
            // Last action was PlayAudioAndGetDigits
            console.log("Join meeting using Meeting id");
            
            const meetingId = event.ActionData.ReceivedDigits;

            // Get/create meeting
            const meeting = await chime.createMeeting({ ClientRequestToken: meetingId, MediaRegion: 'us-east-1' }).promise();
            console.log("meeting details:" + JSON.stringify(meeting, null, 2));

            // Get/create attendee
            const attendee = await chime.createAttendee({ MeetingId: meeting.Meeting.MeetingId, ExternalUserId: fromNumber }).promise();
            console.log("attendee details:" + JSON.stringify(attendee, null, 2));

            await updateAttendee(event, meeting.Meeting.MeetingId, attendee.Attendee.AttendeeId);

            // Return join meeting action to bridge user to meeting
            joinChimeMeetingAction.Parameters.JoinToken = attendee.Attendee.JoinToken;
            return [joinChimeMeetingAction];

        case "JoinChimeMeeting":
            // Last action was JoinChimeMeeting
            console.log("Join meeting successful");

            // Play meeting joined and register for dtmf
            playAudioAction.Parameters.AudioSource.Key = "meeting-joined.wav";
            return [receiveDigitsAction, playAudioAction];

        case "ModifyChimeMeetingAttendees":
            switch (event.ActionData.Parameters.Operation) {
                case "Mute":
                    var a = await getAttendeeInfo(fromNumber, callId);
                    
                    if (event.ActionData.Parameters.AttendeeList.includes(a[0].attendeeId.S)) {
                        // Mute
                        playAudioAction.Parameters.AudioSource.Key = "muted.wav";
                    }
                    else {
                        // Mute All
                        playAudioAction.Parameters.AudioSource.Key = "muted-all.wav";
                    }
                    return [playAudioAction];

                case "Unmute":
                    var a = await getAttendeeInfo(fromNumber, callId);
                    if (event.ActionData.Parameters.AttendeeList.includes(a[0].attendeeId.S)) {
                        // Unmute
                        playAudioAction.Parameters.AudioSource.Key = "unmuted.wav";
                    }
                    else {
                        // Unmute All
                        playAudioAction.Parameters.AudioSource.Key = "unmuted-all.wav";
                    }

                    return [playAudioAction];
            }
            
        case "PlayAudio":
            return [];
            
        case "ReceiveDigits":
            return [];

        default:
            return [playAudioAndGetDigitsAction];
    }
}

async function updateAction(event) {
    const fromNumber = event.CallDetails.Participants[0].From;
    const callId = event.CallDetails.Participants[0].CallId;
    const newAction = event.ActionData.Parameters.Arguments.action
    console.log(newAction)
    switch (newAction) {
        case "PlayAudio":
            playAudioAction.Parameters.AudioSource.Key = "updated.wav";
             return [playAudioAction]
             
        case "DisconnectAttendee":
            return [hangupAction]
        
        case "MuteAttendee":
            var attendee = await getAttendeeInfo(fromNumber, callId);
            muteAttendeesAction.Parameters.MeetingId = attendee[0].meetingId.S;
            muteAttendeesAction.Parameters.AttendeeList = [attendee[0].attendeeId.S];
            return [muteAttendeesAction];

        case "UnmuteAttendee":
            var attendee = await getAttendeeInfo(fromNumber, callId);
            unmuteAttendeesAction.Parameters.MeetingId = attendee[0].meetingId.S;
            unmuteAttendeesAction.Parameters.AttendeeList = [attendee[0].attendeeId.S];
            return [unmuteAttendeesAction];
    }
}




async function getAttendeeInfo(fromNumber, callId) {
    console.log("Querying using fromNumber");

    let params = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'fromNumber = :fromNumber and callId = :callId',
        ExpressionAttributeValues: {
            ':fromNumber': { 'S': fromNumber },
            ':callId': { 'S': callId }
        }
    };

    console.log("Query attendee table:", JSON.stringify(params, null, 2));
    const attendee = await dynamodb.query(params).promise();

    if (!attendee.Items) {
        return null;
    }

    console.log("Query succes:", JSON.stringify(attendee, null, 2));
    return attendee.Items;
}

async function getMeetingInfo(fromNumber, callId) {
    console.log("Querying using fromNumber");

    let params = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'fromNumber = :fromNumber and callId = :callId',
        ExpressionAttributeValues: {
            ':fromNumber': { 'S': fromNumber },
            ':callId': { 'S': callId }
        }
    };

    const attendee = await dynamodb.query(params).promise();
    console.log("Query succes:", JSON.stringify(attendee, null, 2));

    if (!attendee.Items) {
        return null;
    }

    params = {
        TableName: process.env.TABLE_NAME,
        IndexName: 'meetingIdIndex',
        KeyConditionExpression: 'meetingId = :meetingId',
        ExpressionAttributeValues: {
            ':meetingId': { 'S': attendee.Items[0].meetingId.S }
        }
    };

    const attendees = await dynamodb.query(params).promise();
    console.log("Query succes:", JSON.stringify(attendees, null, 2));

    if (!attendees.Items) {
        return null;
    }

    return attendees.Items;
}

async function updateAttendee(event, meetingId, attendeeId) {
    // update attendee in Dynamo DB
    let params = {
        TableName: process.env.TABLE_NAME,
        Key: {
            'fromNumber': { 'S': event.CallDetails.Participants[0].From },
            'callId': { 'S': event.CallDetails.Participants[0].CallId }
        },
        UpdateExpression: 'set meetingId = :meetingId, attendeeId = :attendeeId, transactionId = :transactionId',
        ExpressionAttributeValues: {
            ':meetingId': { 'S': meetingId },
            ':attendeeId': { 'S': attendeeId },
            ':transactionId': { 'S': event.CallDetails.TransactionId }
        },
        ReturnValues: "ALL_NEW"
    };

    console.log("Updating attendee:", JSON.stringify(params, null, 2));
    const result = await dynamodb.updateItem(params).promise();

    if (!result) {
        console.error("Unable to update attendee. Error:", JSON.stringify(result, null, 2));
    }

    console.log("Updated attendee. Result:", JSON.stringify(result, null, 2));
}

async function deleteAttendee(event) {
    // delete attendee from Dynamo DB
    let params = {
        TableName: process.env.TABLE_NAME,
        Key: {
            'fromNumber': { 'S': event.CallDetails.Participants[0].From },
            'callId': { 'S': event.CallDetails.Participants[0].CallId }
        }
    };

    console.log("Deleting attendee:", JSON.stringify(params, null, 2));
    const result = await dynamodb.deleteItem(params).promise();

    if (!result) {
        console.error("Unable to delete attendee. Error:", JSON.stringify(result, null, 2));
    }

    console.log("Deleted attendee");
}

const pauseAction = {
    "Type": "Pause",
    "Parameters": {
        "DurationInMilliseconds": "1000"
    }
};

const hangupAction = {
    "Type": "Hangup",
    "Parameters": {
        "SipResponseCode": "0"
    }
};

const playAudioAction = {
    "Type": "PlayAudio",
    "Parameters": {
        "ParticipantTag": "LEG-A",
        "AudioSource": {
            "Type": "S3",
            "BucketName": process.env.BUCKET_NAME,
            "Key": ""
        }
    }
};

const playAudioAndGetDigitsAction = {
    "Type": "PlayAudioAndGetDigits",
    "Parameters": {
        "MinNumberOfDigits": 5,
        "MaxNumberOfDigits": 5,
        "Repeat": 3,
        "InBetweenDigitsDurationInMilliseconds": 1000,
        "RepeatDurationInMilliseconds": 5000,
        "TerminatorDigits": ["#"],
        "AudioSource": {
            "Type": "S3",
            "BucketName": process.env.BUCKET_NAME,
            "Key": "meeting-pin.wav"
        },
        "FailureAudioSource": {
            "Type": "S3",
            "BucketName": process.env.BUCKET_NAME,
            "Key": "meeting-pin.wav"
        }
    }
};

const joinChimeMeetingAction = {
    "Type": "JoinChimeMeeting",
    "Parameters": {
        "AttendeeJoinToken": ""
    }
};

const receiveDigitsAction = {
    "Type": "ReceiveDigits",
    "Parameters": {
        "InputDigitsRegex": "^\\*\\d{1}$",
        "InBetweenDigitsDurationInMilliseconds": 1000,
        "FlushDigitsDurationInMilliseconds": 10000
    }
};

const muteAttendeesAction = {
    "Type": "ModifyChimeMeetingAttendees",
    "Parameters": {
        "ParticipantTag": "LEG-B",
        "Operation": "Mute",
        "MeetingId": "",
        "AttendeeList": ""
    }
};

const unmuteAttendeesAction = {
    "Type": "ModifyChimeMeetingAttendees",
    "Parameters": {
        "ParticipantTag": "LEG-B",
        "Operation": "Unmute",
        "MeetingId": "",
        "AttendeeList": ""
    }
};
