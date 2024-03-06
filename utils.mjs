// Function to make a POST request API call
export async function fetchApiData(url, payload) {

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