// ==============================================================================
// Admin Feature / Award Winner Post API
// POST /api/admin/posts/[id]/feature
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin-guard';
import { repository } from '@/lib/db/repository';
import { cacheManager } from '@/lib/cache/cache-manager';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const post = await repository.getPostById(params.id);
    if (!post) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    const campaign = await repository.getActiveCampaign();
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'No active campaign available to crown this post as winner' },
        { status: 400 }
      );
    }

    const claimed = await repository.claimWinnerAtomic(campaign.id, post.id);

    await cacheManager.invalidateCommunityCache();

    return NextResponse.json({
      success: true,
      message: claimed
        ? 'Post successfully crowned as campaign winner'
        : 'Campaign already has a winner crowned',
      isWinner: claimed || post.is_winner,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
