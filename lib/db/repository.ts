// ==============================================================================
// Data Repository Layer for PALS Community
// Interacts with Supabase PostgreSQL with local testing fallback
// ==============================================================================

import { getSupabaseClient } from './supabase.ts';
import type { Campaign, CampaignStatus, InstagramPost, PostCategory, PostStatus } from '../types/index.ts';

// In-memory thread-safe state for local testing & development without external db
class MemoryStore {
  campaigns: Map<string, Campaign> = new Map();
  posts: Map<string, InstagramPost> = new Map();
  postsByInstagramId: Map<string, string> = new Map(); // instagram_id -> id
  private winnerClaimLock = false;

  constructor() {
    this.seedDefaultCampaign();
  }

  seedDefaultCampaign() {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

    const defaultCampaign: Campaign = {
      id: 'c1111111-1111-1111-1111-111111111111',
      name: 'Tag. Post. Win. Launch Round',
      status: 'live',
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      reward_description: 'Exclusive PALS Hoodie + Tech Goodies Hamper',
      winner_post_id: null,
      created_at: start.toISOString(),
      updated_at: start.toISOString(),
    };

    this.campaigns.set(defaultCampaign.id, defaultCampaign);
  }

  async acquireLock(): Promise<void> {
    while (this.winnerClaimLock) {
      await new Promise((res) => setTimeout(res, 2));
    }
    this.winnerClaimLock = true;
  }

  releaseLock(): void {
    this.winnerClaimLock = false;
  }
}

const memoryStore = new MemoryStore();

export class Repository {
  /**
   * Get active/live campaign
   */
  async getActiveCampaign(): Promise<Campaign | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'live')
        .lte('starts_at', now)
        .gte('ends_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[Repository] getActiveCampaign error:', error);
      }
      if (data) return data as Campaign;
    }

    // Fallback in-memory
    const now = new Date().getTime();
    for (const campaign of memoryStore.campaigns.values()) {
      if (
        campaign.status === 'live' &&
        new Date(campaign.starts_at).getTime() <= now &&
        new Date(campaign.ends_at).getTime() >= now
      ) {
        return { ...campaign };
      }
    }

    // If none within exact date, return any live or winner_selected campaign
    for (const campaign of memoryStore.campaigns.values()) {
      if (campaign.status === 'live' || campaign.status === 'winner_selected') {
        return { ...campaign };
      }
    }

    return null;
  }

  /**
   * Get campaign by ID
   */
  async getCampaignById(id: string): Promise<Campaign | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) console.error('[Repository] getCampaignById error:', error);
      if (data) return data as Campaign;
    }

    const campaign = memoryStore.campaigns.get(id);
    return campaign ? { ...campaign } : null;
  }

  /**
   * Get post by internal ID
   */
  async getPostById(id: string): Promise<InstagramPost | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('instagram_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) console.error('[Repository] getPostById error:', error);
      if (data) return data as InstagramPost;
    }

    const post = memoryStore.posts.get(id);
    return post ? { ...post } : null;
  }

  /**
   * Check duplicate post by Instagram ID
   */
  async getPostByInstagramId(instagramId: string): Promise<InstagramPost | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('instagram_posts')
        .select('*')
        .eq('instagram_id', instagramId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        console.error('[Repository] getPostByInstagramId error:', error);
      }
      if (data) return data as InstagramPost;
    }

    const id = memoryStore.postsByInstagramId.get(instagramId);
    if (id) {
      const post = memoryStore.posts.get(id);
      if (post) return { ...post };
    }
    return null;
  }

  /**
   * Create a new Instagram post
   */
  async createPost(
    postData: Omit<InstagramPost, 'id' | 'created_at' | 'updated_at'>
  ): Promise<InstagramPost> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('instagram_posts')
        .insert([postData])
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to insert post: ${error.message}`);
      }
      return data as InstagramPost;
    }

    // Fallback in-memory
    const now = new Date().toISOString();
    const id = 'p_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    const newPost: InstagramPost = {
      ...postData,
      id,
      created_at: now,
      updated_at: now,
    };

    memoryStore.posts.set(id, newPost);
    memoryStore.postsByInstagramId.set(postData.instagram_id, id);
    return { ...newPost };
  }

  /**
   * Update post status (e.g., approved, rejected)
   */
  async updatePostStatus(id: string, status: PostStatus): Promise<InstagramPost | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('instagram_posts')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) console.error('[Repository] updatePostStatus error:', error);
      return (data as InstagramPost) || null;
    }

    const post = memoryStore.posts.get(id);
    if (!post) return null;
    post.status = status;
    post.updated_at = new Date().toISOString();
    return { ...post };
  }

  /**
   * Update post category (AI or manual)
   */
  async updatePostCategory(id: string, category: PostCategory): Promise<InstagramPost | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('instagram_posts')
        .update({ category, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) console.error('[Repository] updatePostCategory error:', error);
      return (data as InstagramPost) || null;
    }

    const post = memoryStore.posts.get(id);
    if (!post) return null;
    post.category = category;
    post.updated_at = new Date().toISOString();
    return { ...post };
  }

  /**
   * ATOMIC WINNER SELECTION:
   * During an active campaign:
   * The first valid qualifying post gets PALS goodies.
   * If two posts arrive simultaneously, only ONE can become winner.
   */
  async claimWinnerAtomic(campaignId: string, postId: string): Promise<boolean> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      // Call PostgreSQL function claim_campaign_winner
      const { data, error } = await supabase.rpc('claim_campaign_winner', {
        p_campaign_id: campaignId,
        p_post_id: postId,
      });

      if (error) {
        console.error('[Repository] RPC claim_campaign_winner error:', error);
        return false;
      }

      return !!data;
    }

    // Atomic In-Memory Winner Claim using mutex lock
    await memoryStore.acquireLock();
    try {
      const campaign = memoryStore.campaigns.get(campaignId);
      const post = memoryStore.posts.get(postId);

      if (!campaign || !post) {
        return false;
      }

      // Check if winner has already been claimed
      if (campaign.winner_post_id !== null || campaign.status !== 'live') {
        return false;
      }

      const now = new Date().toISOString();

      // Claim winner atomically
      campaign.winner_post_id = postId;
      campaign.status = 'winner_selected';
      campaign.updated_at = now;

      post.is_winner = true;
      post.status = 'approved';
      post.campaign_id = campaignId;
      post.updated_at = now;

      return true;
    } finally {
      memoryStore.releaseLock();
    }
  }

  /**
   * Fetch approved posts for community feed with cursor pagination
   */
  async getApprovedPosts(options: {
    category?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ posts: InstagramPost[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 50) : 10;
    const category = options.category;
    const cursor = options.cursor;

    const supabase = await getSupabaseClient();
    if (supabase) {
      let query = supabase
        .from('instagram_posts')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[Repository] getApprovedPosts error:', error);
        return { posts: [], nextCursor: null, hasMore: false };
      }

      const rows = (data || []) as InstagramPost[];
      const hasMore = rows.length > limit;
      const posts = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null;

      return { posts, nextCursor, hasMore };
    }

    // Fallback in-memory
    let all = Array.from(memoryStore.posts.values()).filter((p) => p.status === 'approved');

    if (category && category !== 'all') {
      all = all.filter((p) => p.category.toLowerCase() === category.toLowerCase());
    }

    // Sort descending by created_at
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Cursor pagination (cursor is created_at ISO)
    if (cursor) {
      const cursorTime = new Date(cursor).getTime();
      all = all.filter((p) => new Date(p.created_at).getTime() < cursorTime);
    }

    const hasMore = all.length > limit;
    const posts = all.slice(0, limit);
    const nextCursor = hasMore && posts.length > 0 ? posts[posts.length - 1].created_at : null;

    return { posts, nextCursor, hasMore };
  }

  /**
   * Fetch all posts for admin moderation
   */
  async getAllPosts(options?: { status?: PostStatus; limit?: number }): Promise<InstagramPost[]> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      let query = supabase
        .from('instagram_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) console.error('[Repository] getAllPosts error:', error);
      return (data || []) as InstagramPost[];
    }

    let all = Array.from(memoryStore.posts.values());
    if (options?.status) {
      all = all.filter((p) => p.status === options.status);
    }
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (options?.limit) {
      all = all.slice(0, options.limit);
    }
    return all.map((p) => ({ ...p }));
  }

  /**
   * Create campaign
   */
  async createCampaign(data: Partial<Campaign>): Promise<Campaign> {
    const now = new Date().toISOString();
    const newCamp: Campaign = {
      id: data.id || 'c_' + Math.random().toString(36).substring(2, 10),
      name: data.name || 'New PALS Campaign',
      status: data.status || 'live',
      starts_at: data.starts_at || now,
      ends_at: data.ends_at || new Date(Date.now() + 14 * 86400000).toISOString(),
      reward_description: data.reward_description || 'PALS Goodies Kit',
      winner_post_id: null,
      created_at: now,
      updated_at: now,
    };

    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data: dbData, error } = await supabase
        .from('campaigns')
        .insert([newCamp])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return dbData as Campaign;
    }

    memoryStore.campaigns.set(newCamp.id, newCamp);
    return { ...newCamp };
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<Campaign | null> {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('campaigns')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) console.error('[Repository] updateCampaignStatus error:', error);
      return (data as Campaign) || null;
    }

    const campaign = memoryStore.campaigns.get(id);
    if (!campaign) return null;
    campaign.status = status;
    campaign.updated_at = new Date().toISOString();
    return { ...campaign };
  }

  /**
   * Reset store (useful for automated tests)
   */
  resetForTesting() {
    memoryStore.posts.clear();
    memoryStore.postsByInstagramId.clear();
    memoryStore.campaigns.clear();
    memoryStore.seedDefaultCampaign();
  }
}

export const repository = new Repository();
