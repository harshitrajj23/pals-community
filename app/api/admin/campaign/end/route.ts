// ==============================================================================
// Admin End Campaign API
// POST /api/admin/campaign/end
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
    const active = await repository.getActiveCampaign();
    if (!active) {
      return NextResponse.json(
        { success: false, error: 'No active campaign to conclude' },
        { status: 404 }
      );
    }

    const updated = await repository.updateCampaignStatus(active.id, 'ended');
    await cacheManager.invalidateCommunityCache();

    return NextResponse.json({
      success: true,
      message: 'Campaign concluded successfully',
      campaign: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
