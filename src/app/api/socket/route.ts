import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'auto';

export async function GET() {
  // Always return port 3000 in development, which matches server.js
  return new NextResponse(
    JSON.stringify({ 
      port: process.env.NODE_ENV === 'development' ? 3000 : null,
      initialized: true 
    }), 
    { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}