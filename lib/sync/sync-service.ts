// ==============================================================================
// Instagram Post Ingestion & Sync Service
// Pipeline: Fetch -> Normalize -> Validate -> Deduplicate -> Store -> Classify -> Winner -> Invalidate Cache
// ==============================================================================

import { repository } from '../db/repository.ts';
import { getInstagramProvider } from '../instagram/factory.ts';
import { contentValidator } from '../validation/content-validator.ts';
import { classifyPostWithMistral } from '../ai/mistral-classifier.ts';
import { cacheManager } from '../cache/cache-manager.ts';
import type { InstagramPost, PostStatus, RawInstagramItem } from '../types/index.ts';

export interface SyncStats {
  received: number;
  stored: number;
  duplicates: number;
  invalid: number;
  winnerAwarded: boolean;
  winnerPostId: string | null;
  lastSyncTime: string;
  errors: string[];
}

export class SyncService {
  private lastSuccessfulSync: string | null = null;
  private lastSyncError: string | null = null;

  /**
   * Ingest a single raw Instagram post through the complete atomic pipeline
   */
  async ingestSinglePost(item: RawInstagramItem): Promise<{
    post: InstagramPost | null;
    isDuplicate: boolean;
    isWinner: boolean;
    error?: string;
  }> {
    try {
      // 1. Check for duplicates immediately (Idempotency)
      const existing = await repository.getPostByInstagramId(item.id);
      if (existing) {
        return {
          post: existing,
          isDuplicate: true,
          isWinner: existing.is_winner,
        };
      }

      // 2. Fetch active campaign for window validation
      const campaign = await repository.getActiveCampaign();

      // 3. Server-side validation
      const validation = contentValidator.validate(item, campaign);
      if (!validation.isValid) {
        return {
          post: null,
          isDuplicate: false,
          isWinner: false,
          error: `Validation failed: ${validation.reasons.join(', ')}`,
        };
      }

      // 4. Mistral AI classification (isolated, non-blocking fallback)
      const classification = await classifyPostWithMistral(item.caption);

      // 5. Build post record
      const postStatus: PostStatus = 'approved'; // Valid posts with @palsofficial are approved

      const createdPost = await repository.createPost({
        instagram_id: item.id,
        username: item.username,
        profile_image_url: item.profile_image_url || null,
        caption: item.caption || null,
        media_url: item.media_url || null,
        thumbnail_url: item.thumbnail_url || null,
        media_type: item.media_type || 'IMAGE',
        permalink: item.permalink || null,
        instagram_created_at: item.timestamp || null,
        received_at: new Date().toISOString(),
        category: classification.category,
        status: postStatus,
        is_winner: false,
        campaign_id: campaign ? campaign.id : null,
      });

      // 6. ATOMIC BUSINESS RULE: First valid post during active campaign gets PALS goodies
      let isWinner = false;
      if (campaign && campaign.status === 'live' && validation.isCampaignEligible) {
        const claimSuccess = await repository.claimWinnerAtomic(campaign.id, createdPost.id);
        if (claimSuccess) {
          isWinner = true;
          createdPost.is_winner = true;
          console.log(
            `[SyncService] 🏆 WINNER CROWNED! Post ${createdPost.id} by @${createdPost.username} won Campaign ${campaign.name}`
          );
        }
      }

      // 7. Invalidate cache so community feed updates immediately
      await cacheManager.invalidateCommunityCache();

      return {
        post: createdPost,
        isDuplicate: false,
        isWinner,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SyncService] ingestSinglePost error:', message);
      return {
        post: null,
        isDuplicate: false,
        isWinner: false,
        error: message,
      };
    }
  }

  /**
   * Run full sync from the Instagram Provider
   */
  async syncInstagramPosts(): Promise<SyncStats> {
    const stats: SyncStats = {
      received: 0,
      stored: 0,
      duplicates: 0,
      invalid: 0,
      winnerAwarded: false,
      winnerPostId: null,
      lastSyncTime: new Date().toISOString(),
      errors: [],
    };

    try {
      const provider = getInstagramProvider();
      const rawPosts = await provider.fetchTaggedPosts(this.lastSuccessfulSync || undefined);

      stats.received = rawPosts.length;

      for (const item of rawPosts) {
        const result = await this.ingestSinglePost(item);

        if (result.isDuplicate) {
          stats.duplicates++;
        } else if (result.post) {
          stats.stored++;
          if (result.isWinner) {
            stats.winnerAwarded = true;
            stats.winnerPostId = result.post.id;
          }
        } else {
          stats.invalid++;
          if (result.error) stats.errors.push(result.error);
        }
      }

      this.lastSuccessfulSync = stats.lastSyncTime;
      this.lastSyncError = null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastSyncError = message;
      stats.errors.push(message);
      console.error('[SyncService] syncInstagramPosts failure:', message);
      // Website never breaks even if sync fails
    }

    return stats;
  }

  getTelemetry() {
    return {
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastSyncError: this.lastSyncError,
    };
  }
}

export const syncService = new SyncService();
