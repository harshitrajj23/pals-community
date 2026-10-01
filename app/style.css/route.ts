import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const cssPath = path.join(process.cwd(), 'style.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    return new NextResponse(css, {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new NextResponse(`/* ${message} */`, { status: 404, headers: { 'Content-Type': 'text/css' } });
  }
}
