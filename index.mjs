import AWS from 'aws-sdk';
//import axios from 'axios';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const BUCKET_SIZE = 5;

export const handler = async (event) => {
    // trigger at season end -> eventbridge trigger or cloudwatch event rule
    // Get 3m rolling distance covered for all user_ids in 'leaderboard' table. Sort in descending order
    // Get user ids from 'leaderboard' table
    const usersResult = await dynamoDb.scan({
        TableName: 'leaderboard',
        ProjectionExpression: 'user_id',
        // You may need to adjust the attributes to match your schema
    }).promise();

    const userIds = usersResult.Items.map(item => item.user_id);

    // // Make API request to endpoint
    const userIdsJSON = JSON.stringify({ user_ids: userIds });
    const apiUrl = "https://88pqpqlu5f.execute-api.eu-west-2.amazonaws.com/dev_1/3-months-aggregate";
    //const apiResponse = await makeApiCall(apiUrl, userIdsJSON);
    const apiResponse = await fetchApiData(apiUrl, userIdsJSON);


    // Convert object to array of key-value pairs
    const usersDistances = Object.entries(apiResponse);

    // Sort the array based on distances in descending order
    usersDistances.sort((a, b) => b[1] - a[1]);

    // Reconstruct object from sorted array
    const sortedObject = Object.fromEntries(entries);

    console.log(sortedObject);

    // Generate a map of "users: position" by bucket ID for use later
    // let positionOldMapping = {};

    // Reassign buckets ('leaderboard' table has a bucket_id column) -> 10 max per bucket
    let currentBucketId = 1;
    let currentPosition = 1;

    // This loop will sett all relevant fields to 0, and update bucket_ids and positions
    for (const user of Object.keys(sortedObject)) {
        // Update bucket_id for the user
        await dynamoDb.updateItem({
            TableName: 'leaderboard',
            Key: { "user_id": user },
            UpdateExpression: 'SET bucket_id = :bucketId',
            ExpressionAttributeValues: { ':bucketId': currentBucketId },
        }).promise();

        // Add the user to the bucket in question to our dictionary from earlier
        // if (!positionOldMapping[currentBucketId]) {
        //     positionOldMapping[currentBucketId] = {};
        // }
        // positionOldMapping[currentBucketId][user] = currentPosition;

        // Randomly allocate positions for users in each bucket into the position_new column of 'leaderboard'
        await dynamoDb.updateItem({
            TableName: 'leaderboard',
            Key: { "user_id": user },
            UpdateExpression: 'SET position_new = :positionNew',
            ExpressionAttributeValues: { ':positionNew': currentPosition },
        }).promise();

        // Set scores to 0
        await dynamoDb.updateItem({
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
        InvocationType: 'Event', // Or 'RequestResponse' if you want to wait for the response
        Payload: JSON.stringify({}) // Payload to pass to the function
    };

    // Define parameters for invoking the leaderboard_bucket_average function
    const params_leaderboard_bucket_average = {
        FunctionName: 'leaderboard_bucket_average',
        InvocationType: 'Event', // Or 'RequestResponse' if you want to wait for the response
        Payload: JSON.stringify({}) // Payload to pass to the function
    };

    // Invoke the Lambda functions sequentially
    try {
        await lambda.invoke(params_leaderboard_refresh_old_positions).promise();
        console.log("leaderboard old positions updated!");
        await lambda.invoke(params_leaderboard_bucket_average).promise();
        console.log("new leaderboard bucket kms pushed to challenges!");

    } catch (err) {
        console.error(err);
    }

    // Set position_old
    // dynamoDb.scan({ TableName: 'leaderboard' }, (err, data) => {
    //     if (err) {
    //         console.error("Error scanning table:", err);
    //     } else {
    //         // Update each item individually
    //         data.Items.forEach(item => {
    //             const bucketId = item.bucket_id;
    //             const newPositionOld = positionOldMapping[bucketId] ? positionOldMapping[bucketId] : null;
    //             if (newPositionOld !== null) {
    //                 const params = {
    //                     TableName: tableName,
    //                     Key: { "user_id": item.user_id },
    //                     UpdateExpression: "SET position_old = :newPositionOld",
    //                     ExpressionAttributeValues: { ":newPositionOld": newPositionOld },
    //                 };
    //                 dynamoDb.update(params, (err, data) => {
    //                     if (err) {
    //                         console.error("Error updating item:", err);
    //                     } else {
    //                         console.log("Item updated successfully:", data);
    //                     }
    //                 });
    //             }
    //         });
    //     }
    // });

    return;
}


// Function to make a POST request API call
async function makeApiCall(url, payload) {
    return new Promise((resolve, reject) => {
        const dataString = JSON.stringify(payload);
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': dataString.length,
            },
        };

        const req = https.request(url, options, (res) => {
            let response = '';

            res.on('data', (chunk) => {
                response += chunk;
            });

            res.on('end', () => {
                console.log("API call ended with response:", response);
                try {
                    const jsonResponse = JSON.parse(response);
                    resolve(jsonResponse);
                } catch (parseError) {
                    console.error("Error parsing API response:", parseError);
                    reject(parseError);
                }
            });
        });

        req.on('error', (e) => {
            console.error("API call error:", e);
            reject(e);
        });

        // Send the request with the payload
        req.write(dataString);
        req.end();
    });
}


// Function to make a POST request API call
async function fetchApiData(url, payload) {

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: payload
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const responseData = await response.json();

        return responseData; // Return the response data
    } catch (error) {
        console.error('There was a problem with the request:', error);
        throw error; // Rethrow the error for handling at higher level
    }
}