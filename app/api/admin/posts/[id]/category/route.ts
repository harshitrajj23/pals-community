// ==============================================================================
// Admin Change Post Category API
// PATCH /api/admin/posts/[id]/category
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin-guard';
import { repository } from '@/lib/db/repository';
import { cacheManager } from '@/lib/cache/cache-manager';
import { PostCategory } from '@/types';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const category = body.category as PostCategory;

    if (!category) {
      return NextResponse.json(
        { success: false, error: 'Category field is required' },
        { status: 400 }
      );
    }

    const updated = await repository.updatePostCategory(params.id, category);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    await cacheManager.invalidateCommunityCache();

    return NextResponse.json({
      success: true,
      message: 'Category updated successfully',
      post: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
