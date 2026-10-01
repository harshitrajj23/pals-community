// ==============================================================================
// Community Posts Public API
// GET /api/community/posts?category=&cursor=&limit=
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { cacheManager } from '@/lib/cache/cache-manager';
import { PaginatedPostsResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'all';
    const cursor = searchParams.get('cursor') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    const cacheKey = `community:feed:${category}:${cursor || 'start'}:${limit}`;
    const cached = await cacheManager.get<PaginatedPostsResponse>(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      });
    }

    const result = await repository.getApprovedPosts({
      category: category === 'all' ? undefined : category,
      cursor,
      limit,
    });

    const responsePayload: PaginatedPostsResponse = {
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };

    // Cache response for 30s (invalidated instantly upon new post ingestion)
    await cacheManager.set(cacheKey, responsePayload, 30);

    return NextResponse.json(responsePayload, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /api/community/posts] Error:', message);
    return NextResponse.json(
      {
        posts: [],
        nextCursor: null,
        hasMore: false,
        error: 'Failed to retrieve community feed',
      },
      { status: 500 }
    );
  }
}
