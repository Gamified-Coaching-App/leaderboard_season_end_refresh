import AWS from 'aws-sdk';
import { handler } from '../index.mjs';
import { fetchApiData } from '../utils.mjs';

// Resetting modules to ensure a clean mock state
beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
});

jest.mock('../utils.mjs', () => ({
    ...jest.requireActual('../utils.mjs'), // Preserve other exports if needed
    fetchApiData: jest.fn()
}));


// Mock the entire AWS SDK
jest.mock('aws-sdk', () => {
    const scanMock = jest.fn();
    const updateMock = jest.fn();
    const lambdaInvokeMock = jest.fn();

    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => ({
                scan: jest.fn(() => ({ promise: scanMock })),
                update: jest.fn(() => ({ promise: updateMock }))
            })),
        },
        Lambda: jest.fn(() => ({
            invoke: jest.fn(() => ({ promise: lambdaInvokeMock }))
        })),
        scanMock,
        updateMock,
        lambdaInvokeMock
    };
});



describe('Lambda Function Tests', () => {
    const mockFetchApiDataResponse = { user1: 100, user2: 200 };
    const mockScanResponse = {
        Items: [{ user_id: 'user1' }, { user_id: 'user2' }],
    };

    it('should update DynamoDB tables and invoke Lambda functions correctly', async () => {


        // Implementing mock behavior for the scan operation
        AWS.scanMock.mockResolvedValueOnce(mockScanResponse);

        // Setting up mock behavior for fetchApiData
        fetchApiData.mockResolvedValueOnce(mockFetchApiDataResponse);

        await handler();

        // Assertions for DynamoDB operations
        expect(AWS.scanMock).toHaveBeenCalledTimes(1);
        // expect(AWS.DynamoDB.DocumentClient.scan).toHaveBeenCalledTimes(1);
        expect(AWS.updateMock).toHaveBeenCalledTimes(3);


        // Assertions for API request
        expect(fetchApiData).toHaveBeenCalledTimes(1);
        expect(fetchApiData).toHaveBeenCalledWith(
            'https://88pqpqlu5f.execute-api.eu-west-2.amazonaws.com/dev_1/3-months-aggregate',
            JSON.stringify({ user_ids: ['user1', 'user2'] })
        );

        // Assertions for Lambda invocations
        expect(AWS.lambdaInvokeMock).toHaveBeenCalledTimes(1);
        // console.log(AWS.lambdaInvokeMock.mock);

    });

    it('should handle errors from DynamoDB scan operation', async () => {
        // Mocking a failure response for the scan operation
        AWS.scanMock.mockRejectedValueOnce(new Error('DynamoDB scan failed'));

        await expect(handler()).rejects.toThrow('DynamoDB scan failed');
    });

    it('should handle errors from API request', async () => {
        AWS.scanMock.mockResolvedValueOnce(mockScanResponse);
        // Mocking a failure response for the API request
        fetchApiData.mockRejectedValueOnce(new Error('API request failed'));

        await expect(handler()).rejects.toThrow('API request failed');
    });

    it('should handle errors from Lambda invocation', async () => {
        AWS.scanMock.mockResolvedValueOnce(mockScanResponse);
        fetchApiData.mockResolvedValueOnce(mockFetchApiDataResponse);

        // Mocking a failure response for Lambda invocation
        AWS.lambdaInvokeMock.mockRejectedValueOnce(new Error('Lambda invocation failed'));

        await expect(handler()).rejects.toThrow('Lambda invocation failed');
    });
});