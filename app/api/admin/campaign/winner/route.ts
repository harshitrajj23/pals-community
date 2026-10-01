// ==============================================================================
// Admin View Campaign Winner API
// GET /api/admin/campaign/winner
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin-guard';
import { repository } from '@/lib/db/repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const campaign = await repository.getActiveCampaign();
    if (!campaign) {
      return NextResponse.json({
        success: true,
        campaign: null,
        winner: null,
      });
    }

    let winnerPost = null;
    if (campaign.winner_post_id) {
      winnerPost = await repository.getPostById(campaign.winner_post_id);
    }

    return NextResponse.json({
      success: true,
      campaign,
      winner: winnerPost
        ? {
            post: winnerPost,
            reward: campaign.reward_description,
          }
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
