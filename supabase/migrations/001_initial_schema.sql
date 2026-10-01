-- ==============================================================================
-- PALS Community Schema Migration 001
-- Tables: campaigns, instagram_posts
-- Constraints: Unique instagram_id, foreign keys, status checks
-- Functions: Atomic winner selection (claim_campaign_winner)
-- Policies: Row Level Security for public reading & service role full access
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('upcoming', 'live', 'winner_selected', 'ended')) DEFAULT 'upcoming',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reward_description TEXT NOT NULL,
  winner_post_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. INSTAGRAM_POSTS TABLE
CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instagram_id TEXT NOT NULL,
  username TEXT NOT NULL,
  profile_image_url TEXT,
  caption TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  media_type TEXT NOT NULL DEFAULT 'IMAGE',
  permalink TEXT,
  instagram_created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL DEFAULT 'Other',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  is_winner BOOLEAN NOT NULL DEFAULT false,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_instagram_posts_instagram_id UNIQUE (instagram_id)
);

-- Add circular foreign key from campaigns.winner_post_id to instagram_posts(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_campaign_winner_post'
  ) THEN
    ALTER TABLE campaigns
      ADD CONSTRAINT fk_campaign_winner_post
      FOREIGN KEY (winner_post_id)
      REFERENCES instagram_posts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. INDEXES FOR HIGH-PERFORMANCE QUERIES & CURSOR PAGINATION
CREATE INDEX IF NOT EXISTS idx_instagram_posts_status_created ON instagram_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_category_status ON instagram_posts (category, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_is_winner ON instagram_posts (is_winner) WHERE is_winner = true;
CREATE INDEX IF NOT EXISTS idx_instagram_posts_campaign_id ON instagram_posts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_active_range ON campaigns (starts_at, ends_at) WHERE status = 'live';

-- 4. AUTOMATIC UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_instagram_posts_updated_at ON instagram_posts;
CREATE TRIGGER trg_instagram_posts_updated_at
BEFORE UPDATE ON instagram_posts
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

-- 5. ATOMIC BUSINESS LOGIC: CLAIM WINNER
-- Ensures that during concurrent post ingestions, strictly ONE post can be crowned winner for a campaign
CREATE OR REPLACE FUNCTION claim_campaign_winner(
  p_campaign_id UUID,
  p_post_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INT;
BEGIN
  -- Atomic conditional update with implicit row-lock on campaigns
  UPDATE campaigns
  SET winner_post_id = p_post_id,
      status = 'winner_selected',
      updated_at = now()
  WHERE id = p_campaign_id
    AND winner_post_id IS NULL
    AND status = 'live';

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected > 0 THEN
    UPDATE instagram_posts
    SET is_winner = TRUE,
        status = 'approved',
        campaign_id = p_campaign_id,
        updated_at = now()
    WHERE id = p_post_id;
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop existing policies if any to avoid errors on rerun
  DROP POLICY IF EXISTS "Allow public read access to campaigns" ON campaigns;
  DROP POLICY IF EXISTS "Allow public read access to approved posts" ON instagram_posts;
  DROP POLICY IF EXISTS "Allow service role full access to campaigns" ON campaigns;
  DROP POLICY IF EXISTS "Allow service role full access to instagram_posts" ON instagram_posts;

  -- Create policies
  CREATE POLICY "Allow public read access to campaigns" ON campaigns
    FOR SELECT USING (true);

  CREATE POLICY "Allow public read access to approved posts" ON instagram_posts
    FOR SELECT USING (status = 'approved');

  CREATE POLICY "Allow service role full access to campaigns" ON campaigns
    FOR ALL USING (true);

  CREATE POLICY "Allow service role full access to instagram_posts" ON instagram_posts
    FOR ALL USING (true);
END $$;

-- 7. DEFAULT ACTIVE CAMPAIGN SEED
INSERT INTO campaigns (id, name, status, starts_at, ends_at, reward_description)
VALUES (
  'c1111111-1111-1111-1111-111111111111',
  'PALSxBMSIT Tag. Post. Win. Launch Round',
  'live',
  now() - INTERVAL '1 day',
  now() + INTERVAL '30 days',
  'Exclusive PALS Hoodie + Tech Goodies Hamper'
)
ON CONFLICT (id) DO NOTHING;
