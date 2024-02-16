import AWS from 'aws-sdk';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const number_per_bucket = 10;

export const handler = async (event) => {
    // trigger at season end -> eventbridge trigger or cloudwatch event rule

    // for all users in leaderboard, including those in negative bucket request their rolling 3m km. Reassign buckets
    // clean cut rank

    // API request to Gabriel for 3m rolling. Get for all user_id. Sort

    // reassign buckets -> 10 max per bucket

    // randomly allocate positions

    // build position_old from these random new_positions -> mega loop

    // set aggregate_season_scores, endurance and strength to 0


    return;
}
