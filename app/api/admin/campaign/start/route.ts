// ==============================================================================
// Admin Start Campaign API
// POST /api/admin/campaign/start
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin-guard';
import { repository } from '@/lib/db/repository';
import { cacheManager } from '@/lib/cache/cache-manager';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const endsAt = body.ends_at || new Date(now.getTime() + 14 * 86400000).toISOString();

    const campaign = await repository.createCampaign({
      name: body.name || 'PALS Tag. Post. Win. Campaign',
      status: 'live',
      starts_at: body.starts_at || now.toISOString(),
      ends_at: endsAt,
      reward_description: body.reward_description || 'Exclusive PALS Goodies & Tech Hamper',
    });

    await cacheManager.invalidateCommunityCache();

    return NextResponse.json({
      success: true,
      message: 'Campaign launched successfully',
      campaign,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
