import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const jsPath = path.join(process.cwd(), 'app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    return new NextResponse(js, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new NextResponse(`console.error("Failed to load app.js: ${message}");`, {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }
}
