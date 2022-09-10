const config = await fetch('./config.json').then((response) => response.json());

export const AmplifyConfig = {
    API: {
        endpoints: [
            {
                name: 'updateCall',
                endpoint: config.apiUrl,
            },
            {
                name: 'queryMeetings',
                endpoint: config.apiUrl,
            },
        ],
    },
};
