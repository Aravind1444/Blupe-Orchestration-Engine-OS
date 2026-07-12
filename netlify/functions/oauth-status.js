/**
 * OAuth Status - Reports which OAuth providers are configured on the server
 * Route: /api/oauth-status
 *
 * Returns booleans only (never the credential values). The Settings UI uses
 * this to decide which "Connect" buttons to show instead of a hardcoded
 * "Coming Soon" placeholder.
 */

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const configured = (...vars) => vars.every((v) => !!process.env[v] && process.env[v].trim() !== '');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify({
      google: configured('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
      slack: configured('SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'),
      hubspot: configured('HUBSPOT_CLIENT_ID', 'HUBSPOT_CLIENT_SECRET'),
      stripe: configured('STRIPE_CLIENT_ID', 'STRIPE_SECRET_KEY'),
    }),
  };
};
