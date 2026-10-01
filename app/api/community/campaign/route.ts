// ==============================================================================
// Community Campaign Public API
// GET /api/community/campaign
// Returns active campaign details, reward descriptions, and winner details
// ==============================================================================

import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { cacheManager } from '@/lib/cache/cache-manager';
import { CampaignResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const cacheKey = 'community:campaign:current';
    const cached = await cacheManager.get<CampaignResponse>(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      });
    }

    const campaign = await repository.getActiveCampaign();

    let winnerData: CampaignResponse['winner'] = null;

    if (campaign && campaign.winner_post_id) {
      const winnerPost = await repository.getPostById(campaign.winner_post_id);
      if (winnerPost) {
        winnerData = {
          post: winnerPost,
          user: {
            username: winnerPost.username,
            profile_image_url: winnerPost.profile_image_url,
          },
          reward: campaign.reward_description,
        };
      }
    }

    const payload: CampaignResponse = {
      campaign,
      winner: winnerData,
    };

    await cacheManager.set(cacheKey, payload, 30);

    return NextResponse.json(payload, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /api/community/campaign] Error:', message);
    return NextResponse.json(
      {
        campaign: null,
        winner: null,
        error: 'Failed to load campaign status',
      },
      { status: 500 }
    );
  }
}
