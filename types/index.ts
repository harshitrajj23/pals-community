// ==============================================================================
// Core Domain Types for PALS Community
// ==============================================================================

export type CampaignStatus = 'upcoming' | 'live' | 'winner_selected' | 'ended';

export type PostStatus = 'pending' | 'approved' | 'rejected';

export type PostCategory =
  | 'Hackathon'
  | 'Event'
  | 'Workshop'
  | 'Project'
  | 'Achievement'
  | 'Club Activity'
  | 'Tech'
  | 'Community'
  | 'Other';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  starts_at: string; // ISO date
  ends_at: string;   // ISO date
  reward_description: string;
  winner_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstagramPost {
  id: string;
  instagram_id: string;
  username: string;
  profile_image_url: string | null;
  caption: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  permalink: string | null;
  instagram_created_at: string | null;
  received_at: string;
  category: PostCategory;
  status: PostStatus;
  is_winner: boolean;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawInstagramItem {
  id: string;
  username: string;
  caption?: string | null;
  media_type?: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  permalink?: string | null;
  timestamp?: string | null;
  profile_image_url?: string | null;
  like_count?: number;
  comments_count?: number;
}

export interface MistralClassificationResult {
  category: PostCategory;
  confidence: number;
}

export interface PaginatedPostsResponse {
  posts: InstagramPost[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface CampaignResponse {
  campaign: Campaign | null;
  winner: {
    post: InstagramPost | null;
    user: {
      username: string;
      profile_image_url: string | null;
    } | null;
    reward: string | null;
  } | null;
}
