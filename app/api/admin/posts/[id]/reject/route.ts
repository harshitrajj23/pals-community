// ==============================================================================
// Admin Reject Post API
// POST /api/admin/posts/[id]/reject
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
    const updated = await repository.updatePostStatus(params.id, 'rejected');
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    await cacheManager.invalidateCommunityCache();

    return NextResponse.json({
      success: true,
      message: 'Post rejected successfully',
      post: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
