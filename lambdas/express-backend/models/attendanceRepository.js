const { DynamoDBClient, UpdateItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({ region: 'us-east-1' });
const TABLE_NAME = process.env.TABLE_NAME;

// Table spec:
// ------------
// index: classId (String), email (String)

const updateAttendance = async (classId, email, attendance, loginInfo) => {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            'classId': { S: classId },
            'email': { S: email },
        },
        UpdateExpression: 'SET attendance = :attendance, validityTimestamp = :validityTimestamp, checkInDate =:checkInDate, loginInfo = :loginInfo',
        ExpressionAttributeValues: {
            ':attendance': { BOOL: attendance },
            ':validityTimestamp': { N: (Math.floor(Date.now() / 1000) + 60 * 60 * 24).toString() }, // 24 hours
            ':checkInDate': { S: new Date().toISOString() },
            ':loginInfo': { S: loginInfo }
        },
    };


    const data = await client.send(new UpdateItemCommand(params));
    console.log('Success update attendance', data);
    return data;
};

const getClassAttendance = async (classId) => {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'classId = :classId',
        ExpressionAttributeValues: {
            ':classId': { S: classId }
        }
    };

    const data = await client.send(new QueryCommand(params));
    console.log('Success get class attendance', data);
    return data.Items.map(item => {
        return {
            email: item.email.S,
            attendance: item.attendance.BOOL,
            date: item.checkInDate.S,
            loginInfo: item.loginInfo.S
        };
    });
}


module.exports = { updateAttendance, getClassAttendance };
