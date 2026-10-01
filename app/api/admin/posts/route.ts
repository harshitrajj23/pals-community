// ==============================================================================
// Admin Posts Listing & Manual Ingest API
// GET /api/admin/posts?status=
// POST /api/admin/posts (Manual Ingest / Verification Fallback)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin-guard';
import { repository } from '@/lib/db/repository';
import { syncService } from '@/lib/sync/sync-service';
import { PostStatus, RawInstagramItem } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as PostStatus | null;
    const posts = await repository.getAllPosts({
      status: status || undefined,
    });

    return NextResponse.json({
      success: true,
      posts,
      total: posts.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const rawItem: RawInstagramItem = {
      id: body.instagram_id || body.id || 'ig_manual_' + Date.now(),
      username: body.username,
      caption: body.caption,
      media_type: body.media_type || 'IMAGE',
      media_url: body.media_url || null,
      thumbnail_url: body.thumbnail_url || null,
      permalink: body.permalink || null,
      timestamp: body.timestamp || new Date().toISOString(),
      profile_image_url: body.profile_image_url || null,
      like_count: body.like_count || 0,
      comments_count: body.comments_count || 0,
    };

    const result = await syncService.ingestSinglePost(rawItem);

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      post: result.post,
      isDuplicate: result.isDuplicate,
      isWinner: result.isWinner,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
