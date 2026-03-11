const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

export function getAuthUrl(returnUrl: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return `${STEAM_OPENID_URL}?${params.toString()}`;
}

export async function verifyCallback(params: Record<string, string>): Promise<string | null> {
  // Build verification request by copying all openid params and changing mode
  const verifyParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'openid.mode') {
      verifyParams.set(key, 'check_authentication');
    } else {
      verifyParams.set(key, value);
    }
  }

  try {
    const response = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });

    const text = await response.text();

    if (!text.includes('is_valid:true')) {
      return null;
    }

    // Extract Steam ID from claimed_id
    // Format: https://steamcommunity.com/openid/id/STEAMID64
    const claimedId = params['openid.claimed_id'];
    if (!claimedId) return null;

    const match = claimedId.match(/\/openid\/id\/(\d+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
