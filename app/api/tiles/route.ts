import { NextRequest, NextResponse } from 'next/server';

// Proxy map tiles/resources so they're same-origin — prevents canvas CORS taint
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing url', { status: 400 });

  // Only proxy known safe map CDNs
  const allowed = [
    'tiles.openfreemap.org',
    'tile.openfreemap.org',
    'a.tile.openfreemap.org',
    'b.tile.openfreemap.org',
    'c.tile.openfreemap.org',
    'fonts.openmaptiles.org',
    'demotiles.maplibre.org',
    'basemaps.cartocdn.com',
    'a.basemaps.cartocdn.com',
    'b.basemaps.cartocdn.com',
    'c.basemaps.cartocdn.com',
    'd.basemaps.cartocdn.com',
    'api.maptiler.com',
  ];
  const { hostname } = new URL(url);
  if (!allowed.some(h => hostname === h || hostname.endsWith('.' + h))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        cache: 'force-cache',
        headers: {
          'User-Agent': 'Mozilla/5.0 MapPoster/1.0',
          'Accept': '*/*',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      console.error(`[tiles proxy] upstream ${res.status} for ${url}`);
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    console.error(`[tiles proxy] ${isAbort ? 'timeout' : 'error'} for ${url}:`, err);
    return new NextResponse(isAbort ? 'Gateway Timeout' : 'Proxy error', {
      status: isAbort ? 504 : 502,
    });
  }
}
