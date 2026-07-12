// Netlify Serverless Function: Health Check

export async function handler(event, context) {
    return {
        statusCode: 200,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            runtime: 'netlify-functions'
        })
    };
}
