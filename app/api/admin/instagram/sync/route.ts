// ==============================================================================
// Admin Instagram Sync API
// POST /api/admin/instagram/sync
// Manually triggers periodic synchronization with Instagram / Mock provider
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth/admin-guard';
import { syncService } from '@/lib/sync/sync-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authError = verifyAdminAuth(req);
  if (authError) return authError;

  try {
    const stats = await syncService.syncInstagramPosts();
    return NextResponse.json({
      success: true,
      message: 'Instagram synchronization completed successfully',
      stats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /api/admin/instagram/sync] Error:', message);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
