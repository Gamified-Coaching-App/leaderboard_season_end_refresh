import AWS from 'aws-sdk';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const BUCKET_SIZE = 10;

export const handler = async (event) => {
    // trigger at season end -> eventbridge trigger or cloudwatch event rule
    // Get 3m rolling distance covered for all user_ids in 'leaderboard' table. Sort in descending order
    // Get user ids from 'leaderboard' table
    const usersResult = await dynamoDb.scan({
        TableName: 'leaderboard',
        ProjectionExpression: 'user_id',
        // You may need to adjust the attributes to match your schema
    }).promise();

    const users = usersResult.Items.map(item => item.user_id);
    // Create Lambda service object
    const lambda = new AWS.Lambda();

    // Construct parameters for the Lambda function; TODO INPUT GABRIEL'S LAMBDA FUNCTION
    const params = {
        FunctionName: '......',
        Payload: JSON.stringify({ 'user_ids': users }) // Payload to send to the function
    };

    // Invoke the Lambda function
    lambda.invoke(params, (err, data) => {
        if (err) {
            console.error(err);
        } else {
            // Handle the response from the Lambda function
            console.log(data.Payload);
            const usersWithDistance = JSON.parse(data.Payload);
        }
    });

    // Sort users by distances covered over the last 3 months
    usersWithDistance.sort((a, b) => b.distance_covered - a.distance_covered);

    // Generate a map of "users: position" by bucket ID for use later
    let positionOldMapping = {};

    // Reassign buckets ('leaderboard' table has a bucket_id column) -> 10 max per bucket
    let currentBucketId = 1;
    let currentPosition = 1;

    for (const user of usersWithDistance) {
        // Update bucket_id for the user
        await dynamoDb.updateItem({
            TableName: 'leaderboard',
            Key: { "user_id": user.user_id },
            UpdateExpression: 'SET bucket_id = :bucketId',
            ExpressionAttributeValues: { ':bucketId': currentBucketId },
        }).promise();

        // Add the user to the bucket in question to our dictionary from earlier
        if (!positionOldMapping[currentBucketId]) {
            positionOldMapping[currentBucketId] = {};
        }
        positionOldMapping[currentBucketId][user.user_id] = currentPosition;

        // Randomly allocate positions for users in each bucket into the position_new column of 'leaderboard'
        await dynamoDb.updateItem({
            TableName: 'leaderboard',
            Key: { "user_id": user.user_id },
            UpdateExpression: 'SET position_new = :positionNew',
            ExpressionAttributeValues: { ':positionNew': currentPosition },
        }).promise();

        // Set scores to 0
        await dynamoDb.updateItem({
            TableName: 'leaderboard',
            Key: { "user_id": user.user_id },
            UpdateExpression: 'SET aggregate_skills_season = :zero, endurance_season = :zero, strength_season = :zero',
            ExpressionAttributeValues: { ':zero': 0 },
        }).promise();

        // Increment currentPosition
        currentPosition++;

        // Check if currentBucketId reaches BUCKET_SIZE
        if (currentPosition > BUCKET_SIZE) {
            currentPosition = 1;
            currentBucketId++;
        }
    }

    // Set position_old
    dynamoDb.scan({ TableName: 'leaderboard' }, (err, data) => {
        if (err) {
            console.error("Error scanning table:", err);
        } else {
            // Update each item individually
            data.Items.forEach(item => {
                const bucketId = item.bucket_id;
                const newPositionOld = positionOldMapping[bucketId] ? positionOldMapping[bucketId] : null;
                if (newPositionOld !== null) {
                    const params = {
                        TableName: tableName,
                        Key: { "user_id": item.user_id },
                        UpdateExpression: "SET position_old = :newPositionOld",
                        ExpressionAttributeValues: { ":newPositionOld": newPositionOld },
                    };
                    dynamoDb.update(params, (err, data) => {
                        if (err) {
                            console.error("Error updating item:", err);
                        } else {
                            console.log("Item updated successfully:", data);
                        }
                    });
                }
            });
        }
    });

    return;
}
