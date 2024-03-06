import { fetchApiData } from '../utils.mjs';

describe('fetchApiData function tests', () => {
    const url = 'https://api.example.com/data';
    const payload = JSON.stringify({ key: 'value' });

    beforeEach(() => {
        global.fetch = jest.fn(); // Mock the global fetch function
    });

    afterEach(() => {
        global.fetch.mockClear(); // Clear mock usage data after each test
    });

    it('should return response data on successful API call', async () => {
        const responseData = { success: true, data: 'some data' };

        // Mock the fetch function to resolve with a mock response
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValueOnce(responseData),
        });

        // Call the function
        const result = await fetchApiData(url, payload);

        // Assertions
        expect(result).toEqual(responseData);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload,
        });
    });

    it('should throw an error when API call returns a non-ok response', async () => {
        // Mock the fetch function to resolve with a non-ok response
        global.fetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Internal Server Error',
        });

        // Call the function and expect it to throw an error
        await expect(fetchApiData(url, payload)).rejects.toThrow('Network response was not ok');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload,
        });
    });

    it('should throw an error when API call fails', async () => {
        const errorMessage = 'Failed to fetch data';

        // Mock the fetch function to reject with an error
        global.fetch.mockRejectedValueOnce(new Error(errorMessage));

        // Call the function and expect it to throw an error
        await expect(fetchApiData(url, payload)).rejects.toThrow(errorMessage);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload,
        });
    });
});
