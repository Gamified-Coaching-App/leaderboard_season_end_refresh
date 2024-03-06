import AWS from 'aws-sdk';
import { fetchApiData } from './utils.mjs';
//import axios from 'axios';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const BUCKET_SIZE = 5;

export const handler = async (event) => {
    // trigger at season end -> eventbridge trigger or cloudwatch event rule
    // Get 3m rolling distance covered for all user_ids in 'leaderboard' table. Sort in descending order
    // Get user ids from 'leaderboard' table
    let usersResult;
    try {
        usersResult = await dynamoDb.scan({
            TableName: 'leaderboard',
            ProjectionExpression: 'user_id',
        }).promise();
    } catch (error) {
        // Handle the error
        console.error('DynamoDB scan failed');
        throw error;
    }

    console.log(usersResult);
    const userIds = usersResult.Items.map(item => item.user_id);

    // // Make API request to endpoint
    const userIdsJSON = JSON.stringify({ user_ids: userIds });
    const apiUrl = "https://88pqpqlu5f.execute-api.eu-west-2.amazonaws.com/dev_1/3-months-aggregate";
    const apiResponse = await fetchApiData(apiUrl, userIdsJSON);

    console.log(apiResponse);
    // Convert object to array of key-value pairs
    const usersDistances = Object.entries(apiResponse);

    // Sort the array based on distances in descending order
    usersDistances.sort((a, b) => b[1] - a[1]);

    // Reconstruct object from sorted array
    const sortedObject = Object.fromEntries(usersDistances);

    console.log(sortedObject);

    // Generate a map of "users: position" by bucket ID for use later
    let positionOldMapping = {};

    // Reassign buckets ('leaderboard' table has a bucket_id column) -> 10 max per bucket
    let currentBucketId = 1;
    let currentPosition = 1;

    // This loop will sett all relevant fields to 0, and update bucket_ids and positions
    for (const user of Object.keys(sortedObject)) {
        // Update bucket_id for the user
        await dynamoDb.update({
            TableName: 'leaderboard',
            Key: { "user_id": user },
            UpdateExpression: 'SET bucket_id = :bucketId',
            ExpressionAttributeValues: { ':bucketId': String(currentBucketId) },
        }).promise();

        // Add the user to the bucket in question to our dictionary from earlier
        if (!positionOldMapping[currentBucketId]) {
            positionOldMapping[currentBucketId] = {};
        }
        positionOldMapping[currentBucketId][user] = currentPosition;

        // Randomly allocate positions for users in each bucket into the position_new column of 'leaderboard'
        await dynamoDb.update({
            TableName: 'leaderboard',
            Key: { "user_id": user },
            UpdateExpression: 'SET position_new = :positionNew',
            ExpressionAttributeValues: { ':positionNew': currentPosition },
        }).promise();

        // Set scores to 0
        await dynamoDb.update({
            TableName: 'leaderboard',
            Key: { "user_id": user },
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

    // Create an AWS Lambda service object
    const lambda = new AWS.Lambda();

    // Define parameters for invoking the leaderboard_refresh_old_positions function
    const params_leaderboard_refresh_old_positions = {
        FunctionName: 'leaderboard_refresh_old_positions',
        InvocationType: 'Event',
        Payload: JSON.stringify({}) // Payload to pass to the function
    };

    // Define parameters for invoking the leaderboard_bucket_average function
    const params_leaderboard_bucket_average = {
        FunctionName: 'leaderboard_bucket_average',
        InvocationType: 'Event',
        Payload: JSON.stringify({}) // Payload to pass to the function
    };

    // Invoke the Lambda functions sequentially
    try {
        await lambda.invoke(params_leaderboard_refresh_old_positions).promise();
        console.log("leaderboard old positions updated!");
        await lambda.invoke(params_leaderboard_bucket_average).promise();
        console.log("new leaderboard bucket kms pushed to challenges!");

    } catch (err) {
        console.error('Lambda invocation failed');
        throw err;
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