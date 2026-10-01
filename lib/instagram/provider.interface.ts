// ==============================================================================
// Instagram Provider Interface
// Isolates all Meta / Instagram Graph API operations
// ==============================================================================

import type { RawInstagramItem } from '../types/index.ts';

export interface InstagramProvider {
  readonly name: string;

  /**
   * Fetches recent posts tagging or mentioning @palsofficial
   * @param since Optional timestamp/cursor to fetch posts after
   */
  fetchTaggedPosts(since?: string): Promise<RawInstagramItem[]>;

  /**
   * Retrieves a single post by Instagram ID
   */
  getPostById(instagramId: string): Promise<RawInstagramItem | null>;

  /**
   * Validates official Meta Webhook HMAC-SHA256 signature
   */
  verifyWebhookSignature(signature: string, rawBody: string): boolean;
}
