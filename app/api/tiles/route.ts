import { NextRequest, NextResponse } from 'next/server';

// Proxy map tiles/resources so they're same-origin — prevents canvas CORS taint
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing url', { status: 400 });

  // Only proxy known safe map CDNs
  const allowed = [
    'basemaps.cartocdn.com',
    'a.basemaps.cartocdn.com',
    'b.basemaps.cartocdn.com',
    'c.basemaps.cartocdn.com',
    'd.basemaps.cartocdn.com',
    'fonts.openmaptiles.org',
    'api.maptiler.com',
  ];
  const { hostname } = new URL(url);
  if (!allowed.some(h => hostname === h || hostname.endsWith('.' + h))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return new NextResponse(null, { status: res.status });

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse('Proxy error', { status: 502 });
  }
}
