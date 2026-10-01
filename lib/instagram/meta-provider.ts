// ==============================================================================
// Meta / Instagram Graph API Official Provider
// Strictly uses official Meta endpoints & permissions
// ==============================================================================

import crypto from 'node:crypto';
import type { InstagramProvider } from './provider.interface.ts';
import type { RawInstagramItem } from '../types/index.ts';

interface MetaGraphMediaResponse {
  data?: Array<{
    id: string;
    caption?: string;
    media_type?: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
    username?: string;
    like_count?: number;
    comments_count?: number;
  }>;
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class MetaInstagramProvider implements InstagramProvider {
  readonly name = 'MetaInstagramProvider';

  private readonly accountId: string;
  private readonly accessToken: string;
  private readonly appSecret: string;
  private readonly apiVersion = 'v19.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  constructor(config?: { accountId?: string; accessToken?: string; appSecret?: string }) {
    this.accountId = config?.accountId || process.env.INSTAGRAM_ACCOUNT_ID || '';
    this.accessToken = config?.accessToken || process.env.META_ACCESS_TOKEN || '';
    this.appSecret = config?.appSecret || process.env.META_APP_SECRET || '';

    if (!this.accountId || !this.accessToken) {
      console.warn(
        '[MetaInstagramProvider] Missing INSTAGRAM_ACCOUNT_ID or META_ACCESS_TOKEN. Set MOCK_INSTAGRAM=true for development.'
      );
    }
  }

  /**
   * Fetch posts where @palsofficial was tagged in photo/video using Instagram Graph API:
   * GET /{ig-user-id}/tags
   */
  async fetchTaggedPosts(since?: string): Promise<RawInstagramItem[]> {
    if (!this.accountId || !this.accessToken) {
      throw new Error(
        'Meta Graph API credentials not configured. Please supply INSTAGRAM_ACCOUNT_ID and META_ACCESS_TOKEN.'
      );
    }

    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'username',
      'like_count',
      'comments_count',
    ].join(',');

    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${this.accountId}/tags`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('access_token', this.accessToken);
    url.searchParams.set('limit', '25');

    if (since) {
      url.searchParams.set('since', since);
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        next: { revalidate: 0 }, // Do not cache raw provider call
      });

      const json: MetaGraphMediaResponse = await response.json();

      if (!response.ok || json.error) {
        console.error('[MetaInstagramProvider] Meta Graph API Error:', json.error);
        throw new Error(
          json.error?.message || `Meta API request failed with status ${response.status}`
        );
      }

      if (!json.data || !Array.isArray(json.data)) {
        return [];
      }

      return json.data.map((item) => ({
        id: item.id,
        username: item.username || 'instagram_user',
        caption: item.caption || null,
        media_type: item.media_type || 'IMAGE',
        media_url: item.media_url || null,
        thumbnail_url: item.thumbnail_url || null,
        permalink: item.permalink || null,
        timestamp: item.timestamp || null,
        like_count: item.like_count || 0,
        comments_count: item.comments_count || 0,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[MetaInstagramProvider] fetchTaggedPosts failed:', message);
      throw err;
    }
  }

  /**
   * Fetch single post by Instagram ID:
   * GET /{media-id}?fields=...
   */
  async getPostById(instagramId: string): Promise<RawInstagramItem | null> {
    if (!this.accessToken) return null;

    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'username',
      'like_count',
    ].join(',');

    const url = `${this.baseUrl}/${this.apiVersion}/${instagramId}?fields=${fields}&access_token=${this.accessToken}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || data.error) return null;

      return {
        id: data.id,
        username: data.username || 'instagram_user',
        caption: data.caption || null,
        media_type: data.media_type || 'IMAGE',
        media_url: data.media_url || null,
        thumbnail_url: data.thumbnail_url || null,
        permalink: data.permalink || null,
        timestamp: data.timestamp || null,
        like_count: data.like_count || 0,
      };
    } catch (e) {
      console.error('[MetaInstagramProvider] getPostById error:', e);
      return null;
    }
  }

  /**
   * Verifies Meta Webhook payload HMAC-SHA256 signature
   * header: x-hub-signature-256 = sha256={hash}
   */
  verifyWebhookSignature(signature: string, rawBody: string): boolean {
    if (!this.appSecret) {
      console.warn('[MetaInstagramProvider] META_APP_SECRET not set; cannot verify signature.');
      return false;
    }
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    const expectedSig = crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const receivedSig = signature.replace('sha256=', '');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSig, 'hex'),
        Buffer.from(expectedSig, 'hex')
      );
    } catch {
      return false;
    }
  }
}
