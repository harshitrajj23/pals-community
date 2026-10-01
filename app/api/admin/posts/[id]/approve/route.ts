// ==============================================================================
// Admin Approve Post API
// POST /api/admin/posts/[id]/approve
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
    const updated = await repository.updatePostStatus(params.id, 'approved');
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    await cacheManager.invalidateCommunityCache();

    return NextResponse.json({
      success: true,
      message: 'Post approved successfully',
      post: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
