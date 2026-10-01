// ==============================================================================
// Admin Authentication Guard
// Protects all /api/admin/* endpoints
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';

export function verifyAdminAuth(req: NextRequest): NextResponse | null {
  const configuredKey = process.env.ADMIN_API_KEY || 'pals_admin_secret_key_2026';

  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-admin-key');
  const tokenCookie = req.cookies.get('pals_admin_token')?.value;

  let token = apiKeyHeader || tokenCookie;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Also support the default hint password from frontend for convenience
  if (token === configuredKey || token === 'pals2026') {
    return null; // Authorized
  }

  return NextResponse.json(
    {
      error: 'Unauthorized',
      message: 'Invalid or missing admin credentials. Please provide x-admin-key or Authorization Bearer header.',
    },
    { status: 401 }
  );
}
