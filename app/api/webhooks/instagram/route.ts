// ==============================================================================
// Official Meta / Instagram Graph API Webhook Handler
// GET: Verification Challenge Handshake
// POST: Real-Time Event Ingestion with Signature Verification
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getInstagramProvider } from '@/lib/instagram/factory';
import { syncService } from '@/lib/sync/sync-service';
import { RawInstagramItem } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Meta Webhook verification handshake
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const configuredToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'pals_webhook_verify_token_2026';

  if (mode === 'subscribe' && token === configuredToken) {
    console.log('[MetaWebhook] Verification handshake successful');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Meta Webhook notification event receiver
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const provider = getInstagramProvider();

    // Verify HMAC-SHA256 signature if not in mock mode
    if (process.env.MOCK_INSTAGRAM !== 'true' && provider.verifyWebhookSignature) {
      const isValid = provider.verifyWebhookSignature(signature, rawBody);
      if (!isValid) {
        console.warn('[MetaWebhook] Invalid signature received on webhook payload');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);

    // Parse Meta webhook standard entries
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const mediaId = value.media_id || value.id;

        if (mediaId) {
          // If detailed media object is provided in webhook
          if (value.caption && value.username) {
            const item: RawInstagramItem = {
              id: mediaId,
              username: value.username,
              caption: value.caption,
              media_type: value.media_type || 'IMAGE',
              media_url: value.media_url || null,
              permalink: value.permalink || null,
              timestamp: value.timestamp || new Date().toISOString(),
            };
            await syncService.ingestSinglePost(item);
          } else {
            // Fetch complete media details using the provider
            const fetched = await provider.getPostById(mediaId);
            if (fetched) {
              await syncService.ingestSinglePost(fetched);
            }
          }
        }
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[MetaWebhook] Error processing webhook event:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
