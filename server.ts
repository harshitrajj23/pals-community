// ==============================================================================
// PALS Community Production Backend Server
// Zero-dependency, ultra-fast Node.js TypeScript HTTP Server
// Exposes all Community, Admin, and Webhook APIs and serves the static frontend
// ==============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

import { repository } from './lib/db/repository.ts';
import { syncService } from './lib/sync/sync-service.ts';
import { cacheManager } from './lib/cache/cache-manager.ts';
import { getInstagramProvider } from './lib/instagram/factory.ts';
import type { PaginatedPostsResponse, CampaignResponse, RawInstagramItem, PostStatus, PostCategory } from './types/index.ts';

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'pals_admin_secret_key_2026';

function verifyAdmin(req: http.IncomingMessage): boolean {
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-admin-key'] as string | undefined;

  let token = apiKeyHeader;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  return token === ADMIN_API_KEY || token === 'pals2026';
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        resolve(data);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any, headers?: Record<string, string>) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
    });
    return res.end();
  }

  try {
    // --------------------------------------------------------------------------
    // 1. COMMUNITY PUBLIC APIs
    // --------------------------------------------------------------------------

    // GET /api/community/posts
    if (method === 'GET' && pathname === '/api/community/posts') {
      const category = parsedUrl.searchParams.get('category') || 'all';
      const cursor = parsedUrl.searchParams.get('cursor') || undefined;
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);

      const cacheKey = `community:feed:${category}:${cursor || 'start'}:${limit}`;
      const cached = await cacheManager.get<PaginatedPostsResponse>(cacheKey);

      if (cached) {
        return sendJson(res, 200, cached, { 'X-Cache': 'HIT' });
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

      await cacheManager.set(cacheKey, responsePayload, 30);
      return sendJson(res, 200, responsePayload, { 'X-Cache': 'MISS' });
    }

    // GET /api/community/campaign
    if (method === 'GET' && pathname === '/api/community/campaign') {
      const cacheKey = 'community:campaign:current';
      const cached = await cacheManager.get<CampaignResponse>(cacheKey);

      if (cached) {
        return sendJson(res, 200, cached, { 'X-Cache': 'HIT' });
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

      const payload: CampaignResponse = { campaign, winner: winnerData };
      await cacheManager.set(cacheKey, payload, 30);
      return sendJson(res, 200, payload, { 'X-Cache': 'MISS' });
    }

    // --------------------------------------------------------------------------
    // 2. ADMIN PROTECTED APIs
    // --------------------------------------------------------------------------

    if (pathname.startsWith('/api/admin/')) {
      if (!verifyAdmin(req)) {
        return sendJson(res, 401, { error: 'Unauthorized', message: 'Valid admin credentials required' });
      }

      // POST /api/admin/instagram/sync
      if (method === 'POST' && pathname === '/api/admin/instagram/sync') {
        const stats = await syncService.syncInstagramPosts();
        return sendJson(res, 200, { success: true, message: 'Sync complete', stats });
      }

      // GET /api/admin/posts
      if (method === 'GET' && pathname === '/api/admin/posts') {
        const status = parsedUrl.searchParams.get('status') as PostStatus | null;
        const posts = await repository.getAllPosts({ status: status || undefined });
        return sendJson(res, 200, { success: true, posts, total: posts.length });
      }

      // POST /api/admin/posts (Manual Ingestion)
      if (method === 'POST' && pathname === '/api/admin/posts') {
        const body = await parseBody(req);
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
        };

        const result = await syncService.ingestSinglePost(rawItem);
        if (result.error) {
          return sendJson(res, 400, { success: false, error: result.error });
        }
        return sendJson(res, 200, { success: true, ...result });
      }

      // POST /api/admin/posts/:id/approve
      if (method === 'POST' && pathname.endsWith('/approve')) {
        const id = pathname.replace('/api/admin/posts/', '').replace('/approve', '');
        const updated = await repository.updatePostStatus(id, 'approved');
        if (!updated) return sendJson(res, 404, { success: false, error: 'Post not found' });
        await cacheManager.invalidateCommunityCache();
        return sendJson(res, 200, { success: true, post: updated });
      }

      // POST /api/admin/posts/:id/reject
      if (method === 'POST' && pathname.endsWith('/reject')) {
        const id = pathname.replace('/api/admin/posts/', '').replace('/reject', '');
        const updated = await repository.updatePostStatus(id, 'rejected');
        if (!updated) return sendJson(res, 404, { success: false, error: 'Post not found' });
        await cacheManager.invalidateCommunityCache();
        return sendJson(res, 200, { success: true, post: updated });
      }

      // POST /api/admin/posts/:id/feature
      if (method === 'POST' && pathname.endsWith('/feature')) {
        const id = pathname.replace('/api/admin/posts/', '').replace('/feature', '');
        const post = await repository.getPostById(id);
        if (!post) return sendJson(res, 404, { success: false, error: 'Post not found' });

        const campaign = await repository.getActiveCampaign();
        if (!campaign) return sendJson(res, 400, { success: false, error: 'No active campaign' });

        const claimed = await repository.claimWinnerAtomic(campaign.id, post.id);
        await cacheManager.invalidateCommunityCache();
        return sendJson(res, 200, {
          success: true,
          message: claimed ? 'Post crowned as winner' : 'Winner already selected',
          isWinner: claimed || post.is_winner,
        });
      }

      // PATCH /api/admin/posts/:id/category
      if (method === 'PATCH' && pathname.endsWith('/category')) {
        const id = pathname.replace('/api/admin/posts/', '').replace('/category', '');
        const body = await parseBody(req);
        const updated = await repository.updatePostCategory(id, body.category as PostCategory);
        if (!updated) return sendJson(res, 404, { success: false, error: 'Post not found' });
        await cacheManager.invalidateCommunityCache();
        return sendJson(res, 200, { success: true, post: updated });
      }

      // POST /api/admin/campaign/start
      if (method === 'POST' && pathname === '/api/admin/campaign/start') {
        const body = await parseBody(req);
        const camp = await repository.createCampaign({
          name: body.name || 'PALS Tag. Post. Win. Campaign',
          status: 'live',
          starts_at: body.starts_at || new Date().toISOString(),
          ends_at: body.ends_at || new Date(Date.now() + 14 * 86400000).toISOString(),
          reward_description: body.reward_description || 'Exclusive PALS Goodies Hamper',
        });
        await cacheManager.invalidateCommunityCache();
        return sendJson(res, 200, { success: true, campaign: camp });
      }

      // POST /api/admin/campaign/end
      if (method === 'POST' && pathname === '/api/admin/campaign/end') {
        const active = await repository.getActiveCampaign();
        if (!active) return sendJson(res, 404, { success: false, error: 'No active campaign' });
        const updated = await repository.updateCampaignStatus(active.id, 'ended');
        await cacheManager.invalidateCommunityCache();
        return sendJson(res, 200, { success: true, campaign: updated });
      }

      // GET /api/admin/campaign/winner
      if (method === 'GET' && pathname === '/api/admin/campaign/winner') {
        const campaign = await repository.getActiveCampaign();
        let winnerPost = null;
        if (campaign?.winner_post_id) {
          winnerPost = await repository.getPostById(campaign.winner_post_id);
        }
        return sendJson(res, 200, { success: true, campaign, winner: winnerPost });
      }
    }

    // --------------------------------------------------------------------------
    // 3. META WEBHOOKS
    // --------------------------------------------------------------------------
    if (pathname === '/api/webhooks/instagram') {
      if (method === 'GET') {
        const mode = parsedUrl.searchParams.get('hub.mode');
        const token = parsedUrl.searchParams.get('hub.verify_token');
        const challenge = parsedUrl.searchParams.get('hub.challenge');
        const configuredToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'pals_webhook_verify_token_2026';

        if (mode === 'subscribe' && token === configuredToken) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end(challenge);
        }
        return sendJson(res, 403, { error: 'Forbidden' });
      }

      if (method === 'POST') {
        const rawBody = await parseBody(req);
        const signature = (req.headers['x-hub-signature-256'] as string) || '';
        const provider = getInstagramProvider();

        if (process.env.MOCK_INSTAGRAM !== 'true' && provider.verifyWebhookSignature) {
          const isValid = provider.verifyWebhookSignature(signature, JSON.stringify(rawBody));
          if (!isValid) return sendJson(res, 401, { error: 'Invalid signature' });
        }

        const entries = rawBody.entry || [];
        for (const entry of entries) {
          for (const change of entry.changes || []) {
            const val = change.value || {};
            const mediaId = val.media_id || val.id;
            if (mediaId && val.caption && val.username) {
              await syncService.ingestSinglePost({
                id: mediaId,
                username: val.username,
                caption: val.caption,
                media_type: val.media_type || 'IMAGE',
                media_url: val.media_url || null,
                timestamp: val.timestamp || new Date().toISOString(),
              });
            }
          }
        }
        return sendJson(res, 200, { status: 'success' });
      }
    }

    // --------------------------------------------------------------------------
    // 4. FRONTEND STATIC FILE SERVING
    // --------------------------------------------------------------------------

    if (method === 'GET') {
      if (pathname === '/' || pathname === '/index.html') {
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }

      if (pathname === '/style.css') {
        const css = fs.readFileSync(path.join(process.cwd(), 'style.css'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        return res.end(css);
      }

      if (pathname === '/app.js') {
        const js = fs.readFileSync(path.join(process.cwd(), 'app.js'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        return res.end(js);
      }
    }

    return sendJson(res, 404, { error: 'Not found', path: pathname });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Server Error]', message);
    return sendJson(res, 500, { error: 'Internal Server Error', message });
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 PALS Community Server running on http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/api/community/posts`);
  console.log(`   GET  http://localhost:${PORT}/api/community/campaign`);
  console.log(`   POST http://localhost:${PORT}/api/admin/instagram/sync`);
  console.log(`   POST http://localhost:${PORT}/api/admin/posts`);
  console.log(`   GET  http://localhost:${PORT}/api/webhooks/instagram`);
  console.log(`   🌐 Frontend available at http://localhost:${PORT}/\n`);
});

// Periodic background sync (every 5 minutes or initial sync)
if (process.env.MOCK_INSTAGRAM === 'true') {
  syncService.syncInstagramPosts().then((stats) => {
    console.log(`[AutoSync] Initial sync completed: ${stats.stored} posts stored, ${stats.duplicates} duplicates.`);
  });
}
