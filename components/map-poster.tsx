
'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Download, MapPin, Palette, Layout as LayoutIcon, Brush,
  Layers, MapPin as MarkerIcon, Settings, Crosshair,
  Search, X, Lock as LockIcon, RefreshCw, ZoomIn, ZoomOut,
  Github, Coffee
} from 'lucide-react';
import { Map, MapMarker, MarkerContent } from '@/components/ui/map';
import { ExportProgress } from '@/components/ui/export-progress';
import { toPng, toJpeg } from 'html-to-image';
import { generateMapStyle, type MapStyleColors } from '@/lib/map-style';

// Embeds DPI into a PNG data URL by writing a pHYs chunk (pixels per metre).
// ppm = round(dpi / 0.0254)
function embedPngDpi(dataUrl: string, dpi: number): string {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const ppm = Math.round(dpi / 0.0254);

  // Build pHYs chunk: 4 bytes X ppm, 4 bytes Y ppm, 1 byte unit (1 = metre)
  const physData = new Uint8Array(9);
  const view = new DataView(physData.buffer);
  view.setUint32(0, ppm, false);
  view.setUint32(4, ppm, false);
  physData[8] = 1;

  const chunkType = new TextEncoder().encode('pHYs');
  const chunkLen = new Uint8Array(4);
  new DataView(chunkLen.buffer).setUint32(0, 9, false);

  // CRC over type + data
  const crcInput = new Uint8Array(13);
  crcInput.set(chunkType, 0);
  crcInput.set(physData, 4);
  const crc = pngCrc32(crcInput);
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc, false);

  const physChunk = new Uint8Array(4 + 4 + 9 + 4);
  physChunk.set(chunkLen, 0);
  physChunk.set(chunkType, 4);
  physChunk.set(physData, 8);
  physChunk.set(crcBytes, 17);

  // Insert pHYs after the IHDR chunk (8 sig + 4 len + 4 type + 13 data + 4 crc = 33 bytes)
  const insertAt = 33;
  const result = new Uint8Array(bytes.length + physChunk.length);
  result.set(bytes.slice(0, insertAt), 0);
  result.set(physChunk, insertAt);
  result.set(bytes.slice(insertAt), insertAt + physChunk.length);

  let out = '';
  for (let i = 0; i < result.length; i++) out += String.fromCharCode(result[i]);
  return 'data:image/png;base64,' + btoa(out);
}

function pngCrc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Renders markers as DOM elements inside the poster div so html-to-image captures them.
// MapLibre's Marker uses createPortal outside posterRef, so we duplicate them here.
const OVERZOOM_SCALE = 5.5;

function PosterMarkerOverlay({
  mapRef,
  markers,
  textColor,
}: {
  mapRef: React.RefObject<any>;
  markers: { id: string; name: string; coords: [number, number] }[];
  textColor: string;
}) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const project = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: Record<string, { x: number; y: number }> = {};
    for (const m of markers) {
      const pt = map.project(m.coords);
      // map.project() returns coords in the overzoom canvas space (5.5× poster size).
      // Divide by OVERZOOM_SCALE to get poster-relative pixel positions.
      next[m.id] = { x: pt.x / OVERZOOM_SCALE, y: pt.y / OVERZOOM_SCALE };
    }
    setPositions(next);
  }, [mapRef, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    project();
    map.on('move', project);
    map.on('zoom', project);
    map.on('rotate', project);
    return () => {
      map.off('move', project);
      map.off('zoom', project);
      map.off('rotate', project);
    };
  }, [mapRef, project]);

  if (markers.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 25 }}>
      {markers.map((m) => {
        const pos = positions[m.id];
        if (!pos) return null;
        return (
          // pos is the exact pin point — translate so the bottom of the stem sits at pos
          <div
            key={m.id}
            className="absolute flex flex-col items-center"
            style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}
          >
            {m.name.trim() && (
              <div
                className="text-[8px] font-bold tracking-wider mb-0.5 px-1 py-0.5 rounded whitespace-nowrap"
                style={{ color: textColor, backgroundColor: `${textColor}22`, border: `1px solid ${textColor}44` }}
              >
                {m.name}
              </div>
            )}
            {/* dot */}
            <div
              style={{
                width: 8, height: 8,
                borderRadius: '50%',
                backgroundColor: textColor,
                border: '1.5px solid rgba(0,0,0,0.6)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                flexShrink: 0,
              }}
            />
            {/* stem */}
            <div style={{ width: 1.5, height: 10, backgroundColor: textColor, flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );
}

const MapPoster = () => {
  const [activeTab, setActiveTab] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState('');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg'>('png');
  const [exportDpi, setExportDpi] = useState(300);
  const [exportResolution, setExportResolution] = useState<'1k' | '2k' | '4k' | '6k' | '8k'>('2k');
  const [isMounted, setIsMounted] = useState(false);
  const mapRef = useRef<any>(null);
  const bgMapRef = useRef<any>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(14.9);
  const [mapCenter, setMapCenter] = useState<[number, number]>([77.2295, 28.6139]);
  const [locName, setLocName] = useState('DELHI');
  const [locCountry, setLocCountry] = useState('INDIA');
  const [bearing, setBearing] = useState(0);
  const [isAutoLocation, setIsAutoLocation] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showPosterText, setShowPosterText] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [selectedFont, setSelectedFont] = useState('Space Grotesk');
  const [fontSizeOverride, setFontSizeOverride] = useState<number | null>(null); // null = auto
  const [countrySizeOverride, setCountrySizeOverride] = useState<number | null>(null);
  const [coordSizeOverride, setCoordSizeOverride] = useState<number | null>(null);
  const [textSpacingOverride, setTextSpacingOverride] = useState<number | null>(null);
  const [showHUD, setShowHUD] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [isTextManual, setIsTextManual] = useState(false);
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);
  const [customAspectRatio, setCustomAspectRatio] = useState<number | null>(null);
  const [ratioWidth, setRatioWidth] = useState(10);
  const [ratioHeight, setRatioHeight] = useState(10);
  const [pixelWidth, setPixelWidth] = useState(1080);
  const [pixelHeight, setPixelHeight] = useState(1080);

  // Layer visibility toggles
  const [showLandcover, setShowLandcover] = useState(true);
  const [showBuildings, setShowBuildings] = useState(false);
  const [showWater, setShowWater] = useState(true);
  const [showParks, setShowParks] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showRail, setShowRail] = useState(true);
  const [showAeroway, setShowAeroway] = useState(true);
  const [distance, setDistance] = useState(4000);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [markers, setMarkers] = useState<{ id: string, name: string, coords: [number, number] }[]>([]);

  const fontOptions = [
    'Space Grotesk', 'Inter', 'Playfair Display', 'Roboto Mono',
    'DM Sans', 'Outfit', 'Crimson Text', 'JetBrains Mono'
  ];

  // Auto-sync location name when map moves
  // Shared reverse geocode using Photon directly (no API proxy)
  const reverseGeocode = async (lat: number, lon: number) => {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    if (!f) return null;
    return {
      city: f.properties.city || f.properties.town || f.properties.name || '',
      country: f.properties.country || '',
      suburb: f.properties.district || f.properties.locality || '',
      county: f.properties.state || '',
    };
  };

  useEffect(() => {
    setIsMounted(true);
    if (!isAutoLocation || isTextManual) return;

    const timeoutId = setTimeout(async () => {
      try {
        const [lon, lat] = mapCenter;
        const addr = await reverseGeocode(lat, lon);
        if (addr) {
          const place = addr.city || addr.suburb || addr.county || 'LOCATION';
          setLocName(place.toUpperCase());
          setLocCountry(addr.country.toUpperCase() || 'COUNTRY');
        }
      } catch (err) {
        console.error('Auto-sync geocode error:', err);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [mapCenter, isAutoLocation, isTextManual]);

  // --- Color Utility Functions ---
  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const rgbToHex = (r: number, g: number, b: number): string => {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  };
  const mixColors = (c1: string, c2: string, ratio: number = 0.5): string => {
    const [r1, g1, b1] = hexToRgb(c1);
    const [r2, g2, b2] = hexToRgb(c2);
    return rgbToHex(r1 + (r2 - r1) * ratio, g1 + (g2 - g1) * ratio, b1 + (b2 - b1) * ratio);
  };

  // Theme colors: [land, water, accent/text, buildings, roads]
  const themes = [
    { id: 'midnight-blue', name: 'MIDNIGHT BLUE', description: 'Deep navy with gold roads — luxury atlas aesthetic', colors: ['#0a192f', '#071020', '#fbbf24', '#1e3a5f', '#334155'] },
    { id: 'neon-city', name: 'NEON CITY', description: 'Cyberpunk dark with magenta roads and cyan accents', colors: ['#0d0221', '#0a0118', '#22d3ee', '#d946ef', '#f43f5e'] },
    { id: 'coral', name: 'CORAL', description: 'Warm cream background with terracotta roads and salmon accents', colors: ['#f5ebe0', '#e8d5c4', '#b8512a', '#e8967a', '#d4846a'] },
    { id: 'sage', name: 'SAGE', description: 'Off-white background with muted sage green and teal details', colors: ['#f0efe8', '#e0e4d8', '#4a6741', '#6bafa0', '#5a7a5c'] },
    { id: 'deep-ocean', name: 'DEEP OCEAN', description: 'Clean white with nautical blues and soft azure roads', colors: ['#f0f8ff', '#d4e8f5', '#1e4d7b', '#60a0d0', '#3a7ab8'] },
    { id: 'nordic', name: 'NORDIC LIGHT', description: 'Crisp Scandinavian whites with cool slate details', colors: ['#f8fafc', '#e8edf2', '#334155', '#94a3b8', '#64748b'] },
    { id: 'emerald-forest', name: 'EMERALD FOREST', description: 'Deep greens with bright emerald accent roads', colors: ['#0a2e1a', '#061a10', '#ecfdf5', '#10b981', '#065f46'] },
    { id: 'volcanic', name: 'VOLCANIC', description: 'Black charcoal with glowing red lava accents', colors: ['#1c1412', '#0c0a08', '#ef4444', '#78716c', '#f97316'] },
    { id: 'sakura', name: 'SAKURA', description: 'Soft pink-white with deep rose roads and pastel buildings', colors: ['#fff5f7', '#ffe8ed', '#be185d', '#f9a8d4', '#ec4899'] },
    { id: 'vintage-paper', name: 'VINTAGE PAPER', description: 'Aged parchment with ink-dark roads and sepia details', colors: ['#f5f0e8', '#e8e0d0', '#44332a', '#8b7355', '#6b5940'] },
    { id: 'slate-pro', name: 'SLATE PRO', description: 'Professional dark with cool grey spectrum', colors: ['#0f172a', '#070d1a', '#94a3b8', '#475569', '#334155'] },
    { id: 'heatwave', name: 'HEATWAVE', description: 'Dark ember with bright orange and amber roads', colors: ['#1c1210', '#0c0808', '#f97316', '#ea580c', '#fbbf24'] },
    { id: 'oceanic', name: 'OCEANIC', description: 'Deep teal with bright cyan glowing roads', colors: ['#031d2e', '#011420', '#22d3ee', '#155e75', '#06b6d4'] },
    { id: 'minimalist-dark', name: 'MINIMAL DARK', description: 'Pure black and white for maximum contrast', colors: ['#0a0a0a', '#000000', '#ffffff', '#404040', '#262626'] },
    { id: 'terracotta-earth', name: 'TERRACOTTA', description: 'Warm cream with burnt orange and copper roads', colors: ['#f5ebe0', '#e8d5c4', '#c2613a', '#e8967a', '#a0522d'] },
    { id: 'arctic-cold', name: 'ARCTIC', description: 'Ice white with navy and bright blue accents', colors: ['#f0f4f8', '#dce8f0', '#1e3a5f', '#60a5fa', '#3b82f6'] },
    { id: 'desert-oasis', name: 'DESERT', description: 'Sandy gold with teal oasis accents', colors: ['#f5e6c8', '#e8d0a8', '#8b6914', '#2dd4bf', '#0d9488'] },
    { id: 'emerald-city', name: 'EMERALD CITY', description: 'Deep dark green with bright emerald roads and mint accents', colors: ['#040d08', '#020805', '#f0fdfa', '#065f46', '#10b981'] },
    { id: 'lavender-mist', name: 'LAVENDER', description: 'Deep purple with glowing violet roads', colors: ['#1a0a30', '#0d0518', '#a78bfa', '#7c3aed', '#6d28d9'] },
    { id: 'onyx-gold', name: 'ONYX & GOLD', description: 'Luxurious black with shimmering gold infrastructure', colors: ['#0a0a0a', '#000000', '#d4af37', '#1a1a1a', '#aa8a2e'] },
    { id: 'cyber-yellow', name: 'CYBER YELLOW', description: 'Industrial high-contrast yellow with dark tech roads', colors: ['#fcd34d', '#fbbf24', '#000000', '#f59e0b', '#1e293b'] },
    { id: 'mars-explorer', name: 'MARS EXPLORER', description: 'Martian rust and dust with glowing orange paths', colors: ['#451804', '#2b0f02', '#ea580c', '#7c2d12', '#f97316'] },
    { id: 'retro-surge', name: 'RETRO SURGE', description: '80s synthwave aesthetics with neon purple and cyan', colors: ['#240b36', '#0c0211', '#ff00ff', '#3d1b5d', '#00e5ff'] },
    { id: 'deep-jungle', name: 'DEEP JUNGLE', description: 'Moody forest depths with vibrant green highlights', colors: ['#052e16', '#022c22', '#4ade80', '#14532d', '#166534'] },
    { id: 'rose-noir', name: 'ROSE NOIR', description: 'Midnight mood with soft rose and crimson details', colors: ['#1e1b1b', '#141212', '#fda4af', '#3f3f46', '#f43f5e'] },
    { id: 'gunmetal', name: 'GUNMETAL', description: 'Sleek monochromatic industrial zinc and titanium', colors: ['#27272a', '#18181b', '#fafafa', '#52525b', '#a1a1aa'] },
    { id: 'dracula', name: 'DRACULA', description: 'The classic dark developer palette with gothic tones', colors: ['#282a36', '#191a21', '#ff79c6', '#44475a', '#bd93f9'] },
    { id: 'tokyo-night', name: 'TOKYO NIGHT', description: 'Soft neon city lights with deep indigo and violet', colors: ['#1a1b26', '#16161e', '#7aa2f7', '#24283b', '#bb9af7'] },
    { id: 'cappuccino', name: 'CAPPUCCINO', description: 'Warm, professional stone and crema tones', colors: ['#fafaf9', '#e7e5e4', '#57534e', '#d6d3d1', '#a8a29e'] },
    { id: 'neon-blueprint', name: 'NEON BLUEPRINT', description: 'Technical cyan on deep architecture blue', colors: ['#041020', '#020814', '#22d3ee', '#1e3a5f', '#06b6d4'] },
    { id: 'autumn-ridge', name: 'AUTUMN RIDGE', description: 'Warm harvest oranges and earthy woodland browns', colors: ['#fef3c7', '#fde68a', '#b45309', '#d97706', '#92400e'] },
    { id: 'glacier-ice', name: 'GLACIER ICE', description: 'Frozen white background with pale arctic blue highlights', colors: ['#f0f9ff', '#e0f2fe', '#0369a1', '#7dd3fc', '#0ea5e9'] },
    { id: 'cobalt-night', name: 'COBALT NIGHT', description: 'Deep royal blue with shimmering silver infrastructure', colors: ['#001f3f', '#001021', '#f8fafc', '#1e3a5f', '#94a3b8'] },
    { id: 'charcoal-mint', name: 'CHARCOAL MINT', description: 'Sophisticated charcoal with fresh electric mint roads', colors: ['#18181b', '#09090b', '#4ade80', '#27272a', '#22c55e'] },
    { id: 'amethyst', name: 'AMETHYST', description: 'Vibrant purple spectrum from deep iris to bright violet', colors: ['#1e1b4b', '#17171e', '#a855f7', '#312e81', '#7c3aed'] },
    { id: 'paperback', name: 'PAPERBACK', description: 'Textured cream background with classic navy ink details', colors: ['#f5f5f4', '#e7e5e4', '#1e3a8a', '#d6d3d1', '#1d4ed8'] },
    { id: 'crimson-tide', name: 'CRIMSON TIDE', description: 'Bold blood red paths on a pitch black foundation', colors: ['#000000', '#0a0a0a', '#dc2626', '#1a1a1a', '#991b1b'] },
    { id: 'slate-lime', name: 'SLATE LIME', description: 'Modern professional slate with hyper-visible lime accents', colors: ['#334155', '#1e293b', '#bef264', '#475569', '#84cc16'] },
    { id: 'sahara-dust', name: 'SAHARA DUST', description: 'Scorched earth tones with heat-baked orange infrastructure', colors: ['#fef3c7', '#fde68a', '#78350f', '#d97706', '#b45309'] },
    { id: 'earth-natural', name: 'EARTH NATURAL', description: 'Rich forest greens with deep Atlantic blue waters', colors: ['#2d5a27', '#1e3a5f', '#ffffff', '#78716c', '#000000'] },
    { id: 'earth-vibrant', name: 'EARTH VIBRANT', description: 'Vibrant grass greens with tropical teal waters', colors: ['#4c9b2f', '#00a8cc', '#000000', '#cbd5e1', '#111111'] },
    { id: 'ocean-blueprint', name: 'OCEAN DEPTHS', description: 'Deep oceanic blues with shimmering silver infrastructure', colors: ['#082f49', '#0c4a6e', '#f8fafc', '#075985', '#94a3b8'] },
    { id: 'high-country', name: 'HIGH COUNTRY', description: 'Rugged alpine tones with glacial lakes and dark paths', colors: ['#475569', '#a5dff2', '#ffffff', '#334155', '#1e293b'] },
    { id: 'urban-modern', name: 'URBAN MODERN', description: 'Professional architectural slate with charcoal accents', colors: ['#f8fafc', '#cbd5e1', '#0f172a', '#94a3b8', '#334155'] },
    { id: 'desert-rose', name: 'DESERT ROSE', description: 'Sun-baked sands with terracotta and dusk sky accents', colors: ['#fef3c7', '#7dd3fc', '#92400e', '#d97706', '#451a03'] },
    { id: 'amazon-prime', name: 'AMAZONAS', description: 'Lush tropical jungle with deep river silt water', colors: ['#064e3b', '#2b1d0e', '#ffffff', '#14532d', '#000000'] },
    { id: 'arctic-rim', name: 'ARCTIC RIM', description: 'Frozen tundra whites with deep navy waters', colors: ['#f8fafc', '#1e3a8a', '#000000', '#cbd5e1', '#0f172a'] },
    { id: 'lunar-base', name: 'LUNAR BASE', description: 'Monochromatic moon surface with scientific cyan highlights', colors: ['#27272a', '#18181b', '#22d3ee', '#52525b', '#06b6d4'] },
    { id: 'vintage-gold', name: 'VINTAGE LUXE', description: 'Aged cream with elegant gold and black details', colors: ['#fefce8', '#e2e8f0', '#854d0e', '#fef9c3', '#000000'] },
    { id: 'blueprint-pro', name: 'DRAFTING ROOM', description: 'Classic architectural blueprint with white technical lines', colors: ['#1e3a8a', '#172554', '#ffffff', '#1e40af', '#60a5fa'] },
    { id: 'obsidian-neo', name: 'OBSIDIAN NEO', description: 'Pure black with electric violet glowing roads', colors: ['#09090b', '#000000', '#a855f7', '#27272a', '#7c3aed'] },
    { id: 'serene-mint', name: 'SERENE MINT', description: 'Fresh mint and stone tones for a clean aesthetic', colors: ['#f0fdf4', '#ecfeff', '#166534', '#dcfce7', '#15803d'] },
    { id: 'lava-flow', name: 'MAGMA', description: 'Dark basalt with glowing orange and red lava veins', colors: ['#09090b', '#000000', '#ea580c', '#27272a', '#dc2626'] },
    { id: 'slate-minimal', name: 'SLATE MINIMAL', description: 'Ultra-clean graphite and white for modern spaces', colors: ['#f9fafb', '#f3f4f6', '#111827', '#e5e7eb', '#374151'] },
    { id: 'terracotta-sun', name: 'TERRACOTTA', description: 'Warm sun-baked clay with slate-blue water', colors: ['#fff7ed', '#e0f2fe', '#9a3412', '#fed7aa', '#c2410c'] },
    { id: 'royal-navy', name: 'ROYAL NAVY', description: 'Formal navy and gold for desktop/stately posters', colors: ['#0f172a', '#1e3a8a', '#eab308', '#334155', '#ca8a04'] },
    { id: 'copper-mine', name: 'COPPER MINE', description: 'Industrial oxidized copper with dark earth tones', colors: ['#451a03', '#2a1f11', '#b45309', '#78350f', '#ea580c'] },
    { id: 'sakura-night', name: 'SAKURA NIGHT', description: 'Nighttime Tokyo with soft pink and indigo accents', colors: ['#1e1b4b', '#17171e', '#fda4af', '#312e81', '#f43f5e'] },
    { id: 'forest-trail', name: 'FOREST TRAIL', description: 'Deep woodland greens with natural soil-colored roads', colors: ['#065f46', '#1e3a8a', '#ffffff', '#064e3b', '#451a03'] },
    { id: 'titanium', name: 'TITANIUM', description: 'Sleek metallic grays with high-visibility black roads', colors: ['#52525b', '#3f3f46', '#ffffff', '#71717a', '#000000'] },
    { id: 'tundra-frost', name: 'TUNDRA FROST', description: 'Muted arctic blues with frost-white infrastructure', colors: ['#e2e8f0', '#cbd5e1', '#0f172a', '#94a3b8', '#64748b'] },
    { id: 'cyberpunk-red', name: 'CYBER RED', description: 'High-octane dark with aggressive red and orange neon', colors: ['#050505', '#000000', '#ff0000', '#7a0000', '#ff4d00'] },
    { id: 'deep-moss', name: 'DEEP MOSS', description: 'Extremely dark evergreen with vibrant moss accents', colors: ['#022c22', '#064e3b', '#4ade80', '#065f46', '#22c55e'] },
    { id: 'sandstone-heat', name: 'SANDSTONE', description: 'Warm desert rock with scorched mapping details', colors: ['#e7d5c0', '#d4b499', '#7c2d12', '#a8a29e', '#92400e'] },
    { id: 'electric-violet', name: 'ELECTRIC VIOLET', description: 'Deep space purple with hyper-violet infrastructure', colors: ['#1e1b4b', '#0f172a', '#c084fc', '#312e81', '#a855f7'] },
    { id: 'slate-gold-pro', name: 'SLATE & GOLD', description: 'Sophisticated professional slate with luxury gold', colors: ['#1e293b', '#0f172a', '#eab308', '#334155', '#d97706'] },
    { id: 'forest-fog', name: 'FOREST FOG', description: 'Mist-covered woodlands with pale minimal details', colors: ['#f1f5f9', '#e2e8f0', '#166534', '#94a3b8', '#14532d'] },
    { id: 'midnight-sun', name: 'MIDNIGHT SUN', description: 'Dark polar blue with warm solar orange highlights', colors: ['#0c1a2c', '#060d16', '#fb923c', '#1e3a5f', '#f97316'] },
    { id: 'rose-quartz', name: 'ROSE QUARTZ', description: 'Elegant crystalline pinks with soft white roads', colors: ['#fff1f2', '#ffe4e6', '#be185d', '#fda4af', '#fb7185'] },
    { id: 'ocean-deep-pro', name: 'OCEAN DEEP', description: 'The absolute depths of the sea in monochromatic blue', colors: ['#020617', '#000000', '#3b82f6', '#1e3a8a', '#1d4ed8'] },
    { id: 'terracotta-night-alt', name: 'TERRACOTTA NIGHT', description: 'Midnight base with warm clay and brick infrastructure', colors: ['#0c0a09', '#000000', '#d97706', '#44403c', '#b45309'] },
    { id: 'industrial-zinc', name: 'INDUSTRIAL ZINC', description: 'Raw metallic grays and cold structural tones', colors: ['#3f3f46', '#27272a', '#fafafa', '#52525b', '#e4e4e7'] },
    { id: 'polar-night-white', name: 'POLAR NIGHT', description: 'Deepest arctic blue with shimmering snow-white', colors: ['#020617', '#000000', '#f8fafc', '#1e293b', '#e2e8f0'] },
    { id: 'rustic-autumn-brown', name: 'RUSTIC AUTUMN', description: 'Harvest season browns and deep forest oranges', colors: ['#451a03', '#2b1002', '#fcd34d', '#78350f', '#d97706'] },
    { id: 'digital-sea-cyan', name: 'DIGITAL SEA', description: 'Pure data blue with vibrant cyan network paths', colors: ['#083344', '#0c4a6e', '#22d3ee', '#155e75', '#06b6d4'] },
    { id: 'golden-hour-warm', name: 'GOLDEN HOUR', description: 'Soft twilight yellows and long-shadow oranges', colors: ['#fef3c7', '#fde68a', '#d97706', '#fbbf24', '#f59e0b'] },
    { id: 'concrete-jungle-urban', name: 'CONCRETE JUNGLE', description: 'Urban gray slabs with vibrant rooftop greenery', colors: ['#d4d4d8', '#a1a1aa', '#166534', '#52525b', '#22c55e'] },
    { id: 'icy-peak-blue', name: 'ICY PEAK', description: 'Sharp mountain whites with crystalline blue shadows', colors: ['#f0f9ff', '#e0f2fe', '#0369a1', '#7dd3fc', '#0ea5e9'] },
    { id: 'obsidian-teal-glow', name: 'OBSIDIAN TEAL', description: 'Glassy black with deep underwater teal glow', colors: ['#020617', '#000000', '#2dd4bf', '#134e4a', '#14b8a6'] },
    { id: 'berry-sorbet-pink', name: 'BERRY SORBET', description: 'Rich fruit tones with vibrant berry infrastructure', colors: ['#4c0519', '#2d000d', '#f472b6', '#881337', '#db2777'] },
    { id: 'ancient-stone-gray', name: 'ANCIENT STONE', description: 'Weathered historical beige with dark monument gray', colors: ['#fafaf9', '#f5f5f4', '#44403c', '#d6d3d1', '#78716c'] },
    { id: 'neon-mint-dark-pro', name: 'NEON MINT', description: 'Industrial dark with biological neon mint paths', colors: ['#09090b', '#000000', '#4ade80', '#27272a', '#22c55e'] },
    { id: 'skyline-glow-dusk', name: 'SKYLINE GLOW', description: 'Vibrant city lights at dusk with purple-blue base', colors: ['#1e1b4b', '#312e81', '#fbbf24', '#4338ca', '#f59e0b'] },
    { id: 'deep-amethyst-purple', name: 'DEEP AMETHYST', description: 'Gothic purple spectrum with crystalline highlights', colors: ['#2e1065', '#1e1b4b', '#e9d5ff', '#4c1d95', '#a855f7'] },
    { id: 'carbon-pro-woven', name: 'CARBON PRO', description: 'Professional technical black with woven gray details', colors: ['#0a0a0a', '#000000', '#d4d4d8', '#1a1a1a', '#52525b'] },
    { id: 'sunset-ridge-red', name: 'SUNSET RIDGE', description: 'High-altitude mountain ridge at final sunset', colors: ['#450a0a', '#2d0606', '#fdba74', '#7f1d1d', '#f97316'] },
    { id: 'arctic-bloom-ice', name: 'ARCTIC BLOOM', description: 'Frozen ice landscape with emerging floral pinks', colors: ['#f8fafc', '#f1f5f9', '#f472b6', '#cbd5e1', '#ec4899'] },
    { id: 'dark-matter-void', name: 'DARK MATTER', description: 'Infinite void black with deep theoretical blue', colors: ['#020617', '#000000', '#3b82f6', '#0f172a', '#2563eb'] },
    { id: 'golden-gate-orange', name: 'GOLDEN GATE', description: 'San Francisco fog gray with international orange', colors: ['#f3f4f6', '#e5e7eb', '#ea580c', '#9ca3af', '#c2410c'] },
    { id: 'mystic-forest-magic', name: 'MYSTIC FOREST', description: 'Ancient magical woods with deep purple shadows', colors: ['#064e3b', '#022c22', '#c084fc', '#065f46', '#a855f7'] },
    { id: 'steel-blue-metallic', name: 'STEEL BLUE', description: 'Heavy industrial steel with blueprint blue accents', colors: ['#1e3a8a', '#172554', '#cbd5e1', '#1e40af', '#94a3b8'] },
    { id: 'peach-fuzz-soft', name: 'PEACH FUZZ', description: 'Soft velvet peach with clean porcelain roads', colors: ['#fff7ed', '#ffedd5', '#ea580c', '#fed7aa', '#f97316'] },
    { id: 'empire-state-gold', name: 'EMPIRE STATE', description: '1930s architectural gold and limestone gray', colors: ['#44403c', '#292524', '#fcd34d', '#78716c', '#fbbf24'] },
    { id: 'midnight-galaxy-indigo', name: 'MIDNIGHT GALAXY', description: 'Deep space indigo with starlight violet paths', colors: ['#0f172a', '#020617', '#a78bfa', '#1e293b', '#8b5cf6'] },
    { id: 'sage-brush-dusty', name: 'SAGE BRUSH', description: 'High-desert green with dusty overland trails', colors: ['#f0fdf4', '#dcfce7', '#166534', '#bbf7d0', '#15803d'] },
    { id: 'cyberpunk-green-toxic-alt', name: 'CYBER GREEN', description: 'Warning-level toxic green on industrial dark', colors: ['#050505', '#000000', '#4ade80', '#1a1a1a', '#22c55e'] },
    { id: 'royal-velvet-aristocrat', name: 'ROYAL VELVET', description: 'Deep aristocratic blue with crimson road details', colors: ['#1e3a8a', '#172554', '#ef4444', '#1e40af', '#dc2626'] },
    { id: 'dusty-rose-muted', name: 'DUSTY ROSE', description: 'Muted historical pink with soft lead infrastructure', colors: ['#f5f5f4', '#e7e5e4', '#be185d', '#d6d3d1', '#9d174d'] },
    { id: 'copper-mine-earth', name: 'COPPER GLOW', description: 'Deep earth browns with shimmering copper trails', colors: ['#1c1917', '#0c0a09', '#fb923c', '#44403c', '#ea580c'] },
    { id: 'infinite-horizon-pro', name: 'INFINITE SKY', description: 'Pure upper-atmosphere blues with cloud-white', colors: ['#f0f9ff', '#e0f2fe', '#0284c7', '#bae6fd', '#0369a1'] },
  ];

  const colorLabels = [
    'Overlay', 'Text', 'Land', 'Landcover', 'Water', 'Waterways', 'Parks', 'Buildings',
    'Aeroway', 'Rail', 'Roads Major', 'Roads Minor High', 'Roads Minor Mid',
    'Roads Minor Low', 'Roads Path', 'Road Outline'
  ];

  // Derive 16 layer colors from 5 base theme colors: [land, water, accent, buildings, roads]
  const getColorConfigFromTheme = (theme: any) => {
    const land = theme.colors[0];
    const water = theme.colors[1];
    const accent = theme.colors[2];
    const buildings = theme.colors[3];
    const roads = theme.colors[4];

    return {
      'Overlay': land,
      'Text': accent,
      'Land': land,
      'Landcover': mixColors(land, water, 0.3),
      'Water': water,
      'Waterways': mixColors(water, roads, 0.4),
      'Parks': mixColors(land, water, 0.5),
      'Buildings': buildings,
      'Aeroway': mixColors(land, roads, 0.2),
      'Rail': accent,
      'Roads Major': accent,
      'Roads Minor High': mixColors(accent, roads, 0.4),
      'Roads Minor Mid': roads,
      'Roads Minor Low': mixColors(roads, land, 0.3),
      'Roads Path': mixColors(roads, land, 0.5),
      'Road Outline': land,
    };
  };

  const layouts = [
    // ISO A-series Portrait (exact mm ratios)
    { id: 'a0-portrait', category: 'PRINT — ISO A', name: 'A0 PORTRAIT', dims: '841 × 1189 MM', aspect: 841 / 1189 },
    { id: 'a1-portrait', category: 'PRINT — ISO A', name: 'A1 PORTRAIT', dims: '594 × 841 MM', aspect: 594 / 841 },
    { id: 'a2-portrait', category: 'PRINT — ISO A', name: 'A2 PORTRAIT', dims: '420 × 594 MM', aspect: 420 / 594 },
    { id: 'a3-portrait', category: 'PRINT — ISO A', name: 'A3 PORTRAIT', dims: '297 × 420 MM', aspect: 297 / 420 },
    { id: 'a4-portrait', category: 'PRINT — ISO A', name: 'A4 PORTRAIT', dims: '210 × 297 MM', aspect: 210 / 297 },
    { id: 'a5-portrait', category: 'PRINT — ISO A', name: 'A5 PORTRAIT', dims: '148 × 210 MM', aspect: 148 / 210 },
    { id: 'a6-portrait', category: 'PRINT — ISO A', name: 'A6 PORTRAIT', dims: '105 × 148 MM', aspect: 105 / 148 },
    // ISO A-series Landscape
    { id: 'a0-landscape', category: 'PRINT — ISO A', name: 'A0 LANDSCAPE', dims: '1189 × 841 MM', aspect: 1189 / 841 },
    { id: 'a1-landscape', category: 'PRINT — ISO A', name: 'A1 LANDSCAPE', dims: '841 × 594 MM', aspect: 841 / 594 },
    { id: 'a2-landscape', category: 'PRINT — ISO A', name: 'A2 LANDSCAPE', dims: '594 × 420 MM', aspect: 594 / 420 },
    { id: 'a3-landscape', category: 'PRINT — ISO A', name: 'A3 LANDSCAPE', dims: '420 × 297 MM', aspect: 420 / 297 },
    { id: 'a4-landscape', category: 'PRINT — ISO A', name: 'A4 LANDSCAPE', dims: '297 × 210 MM', aspect: 297 / 210 },
    // ISO B-series Portrait
    { id: 'b1-portrait', category: 'PRINT — ISO B', name: 'B1 PORTRAIT', dims: '707 × 1000 MM', aspect: 707 / 1000 },
    { id: 'b2-portrait', category: 'PRINT — ISO B', name: 'B2 PORTRAIT', dims: '500 × 707 MM', aspect: 500 / 707 },
    { id: 'b3-portrait', category: 'PRINT — ISO B', name: 'B3 PORTRAIT', dims: '353 × 500 MM', aspect: 353 / 500 },
    { id: 'b4-portrait', category: 'PRINT — ISO B', name: 'B4 PORTRAIT', dims: '250 × 353 MM', aspect: 250 / 353 },
    { id: 'b5-portrait', category: 'PRINT — ISO B', name: 'B5 PORTRAIT', dims: '176 × 250 MM', aspect: 176 / 250 },
    // US Paper
    { id: 'us-letter', category: 'PRINT — US', name: 'LETTER', dims: '8.5 × 11 IN', aspect: 8.5 / 11 },
    { id: 'us-legal', category: 'PRINT — US', name: 'LEGAL', dims: '8.5 × 14 IN', aspect: 8.5 / 14 },
    { id: 'us-tabloid', category: 'PRINT — US', name: 'TABLOID / B', dims: '11 × 17 IN', aspect: 11 / 17 },
    { id: 'us-letter-ls', category: 'PRINT — US', name: 'LETTER LANDSCAPE', dims: '11 × 8.5 IN', aspect: 11 / 8.5 },
    // Poster / Large Format
    { id: 'poster-18x24', category: 'PRINT — POSTER', name: '18 × 24 IN', dims: '18 × 24 IN', aspect: 18 / 24 },
    { id: 'poster-24x36', category: 'PRINT — POSTER', name: '24 × 36 IN', dims: '24 × 36 IN', aspect: 24 / 36 },
    { id: 'poster-27x40', category: 'PRINT — POSTER', name: '27 × 40 IN (MOVIE)', dims: '27 × 40 IN', aspect: 27 / 40 },
    { id: 'poster-36x48', category: 'PRINT — POSTER', name: '36 × 48 IN', dims: '36 × 48 IN', aspect: 36 / 48 },
    { id: 'poster-50x70', category: 'PRINT — POSTER', name: '50 × 70 CM', dims: '500 × 700 MM', aspect: 500 / 700 },
    // Square
    { id: 'sq-8x8', category: 'PRINT — SQUARE', name: '8 × 8 IN', dims: '8 × 8 IN', aspect: 1 },
    { id: 'sq-12x12', category: 'PRINT — SQUARE', name: '12 × 12 IN', dims: '12 × 12 IN', aspect: 1 },
    { id: 'sq-20x20', category: 'PRINT — SQUARE', name: '20 × 20 CM', dims: '200 × 200 MM', aspect: 1 },
    // Social Media
    { id: 'inst-square', category: 'SOCIAL MEDIA', name: 'INSTAGRAM SQUARE', dims: '1080 × 1080 PX', aspect: 1 },
    { id: 'inst-port', category: 'SOCIAL MEDIA', name: 'INSTAGRAM PORTRAIT', dims: '1080 × 1350 PX', aspect: 1080 / 1350 },
    { id: 'inst-land', category: 'SOCIAL MEDIA', name: 'INSTAGRAM LANDSCAPE', dims: '1080 × 566 PX', aspect: 1080 / 566 },
    { id: 'story', category: 'SOCIAL MEDIA', name: 'STORY / REEL (9:16)', dims: '1080 × 1920 PX', aspect: 9 / 16 },
    { id: 'fb-post', category: 'SOCIAL MEDIA', name: 'FACEBOOK POST', dims: '1200 × 630 PX', aspect: 1200 / 630 },
    { id: 'fb-cover', category: 'SOCIAL MEDIA', name: 'FACEBOOK COVER', dims: '820 × 312 PX', aspect: 820 / 312 },
    { id: 'twitter-post', category: 'SOCIAL MEDIA', name: 'X / TWITTER POST', dims: '1600 × 900 PX', aspect: 1600 / 900 },
    { id: 'twitter-head', category: 'SOCIAL MEDIA', name: 'X / TWITTER HEADER', dims: '1500 × 500 PX', aspect: 1500 / 500 },
    { id: 'linkedin-post', category: 'SOCIAL MEDIA', name: 'LINKEDIN POST', dims: '1200 × 627 PX', aspect: 1200 / 627 },
    { id: 'linkedin-cover', category: 'SOCIAL MEDIA', name: 'LINKEDIN COVER', dims: '1584 × 396 PX', aspect: 1584 / 396 },
    { id: 'pinterest', category: 'SOCIAL MEDIA', name: 'PINTEREST PIN', dims: '1000 × 1500 PX', aspect: 1000 / 1500 },
    { id: 'youtube-thumb', category: 'SOCIAL MEDIA', name: 'YOUTUBE THUMBNAIL', dims: '1280 × 720 PX', aspect: 1280 / 720 },
    { id: 'tiktok', category: 'SOCIAL MEDIA', name: 'TIKTOK / SHORTS', dims: '1080 × 1920 PX', aspect: 9 / 16 },
    // Digital / Screens
    { id: 'desktop-fhd', category: 'DIGITAL', name: 'DESKTOP FHD', dims: '1920 × 1080 PX', aspect: 1920 / 1080 },
    { id: 'desktop-2k', category: 'DIGITAL', name: 'DESKTOP 2K (QHD)', dims: '2560 × 1440 PX', aspect: 2560 / 1440 },
    { id: 'desktop-4k', category: 'DIGITAL', name: 'DESKTOP 4K (UHD)', dims: '3840 × 2160 PX', aspect: 3840 / 2160 },
    { id: 'ultrawide', category: 'DIGITAL', name: 'ULTRAWIDE 21:9', dims: '2560 × 1080 PX', aspect: 2560 / 1080 },
    { id: 'iphone-15', category: 'DIGITAL', name: 'IPHONE 15 PRO', dims: '1179 × 2556 PX', aspect: 1179 / 2556 },
    { id: 'iphone-plus', category: 'DIGITAL', name: 'IPHONE 15 PLUS', dims: '1290 × 2796 PX', aspect: 1290 / 2796 },
    { id: 'android-fhd', category: 'DIGITAL', name: 'ANDROID FHD+', dims: '1080 × 2400 PX', aspect: 1080 / 2400 },
    { id: 'ipad-pro', category: 'DIGITAL', name: 'IPAD PRO 12.9"', dims: '2048 × 2732 PX', aspect: 2048 / 2732 },
    { id: 'macbook', category: 'DIGITAL', name: 'MACBOOK PRO 16"', dims: '3456 × 2234 PX', aspect: 3456 / 2234 },
    // Shapes
    { id: 'perfect-circle', category: 'SHAPES', name: 'PERFECT CIRCLE', dims: 'CIRCULAR', aspect: 1, isCircular: true },
    { id: 'sq-1x1', category: 'SHAPES', name: 'SQUARE 1:1', dims: '1:1', aspect: 1 },
    { id: 'wide-2x1', category: 'SHAPES', name: 'WIDE 2:1', dims: '2:1', aspect: 2 },
    { id: 'classic-4x3', category: 'SHAPES', name: 'CLASSIC 4:3', dims: '4:3', aspect: 4 / 3 },
    { id: 'cinema-235', category: 'SHAPES', name: 'CINEMASCOPE 2.35:1', dims: '2.35:1', aspect: 2.35 },
    // ISO C-series (Envelopes)
    { id: 'c4-env', category: 'STATIONERY', name: 'C4 ENVELOPE', dims: '229 × 324 MM', aspect: 229 / 324 },
    { id: 'c5-env', category: 'STATIONERY', name: 'C5 ENVELOPE', dims: '162 × 229 MM', aspect: 162 / 229 },
    { id: 'dl-env', category: 'STATIONERY', name: 'DL ENVELOPE', dims: '220 × 110 MM', aspect: 220 / 110 },
    // Photo
    { id: 'polaroid', category: 'PHOTOGRAPHY', name: 'POLAROID CLASSIC', dims: '107 × 88 MM', aspect: 88 / 107 },
    { id: '35mm-film', category: 'PHOTOGRAPHY', name: '35MM FILM', dims: '36 × 24 MM', aspect: 36 / 24 },
    { id: 'photo-4x6', category: 'PHOTOGRAPHY', name: '4 × 6 IN (PHOTO)', dims: '4 × 6 IN', aspect: 4 / 6 },
    { id: 'photo-5x7', category: 'PHOTOGRAPHY', name: '5 × 7 IN (PHOTO)', dims: '5 × 7 IN', aspect: 5 / 7 },
    { id: 'photo-8x10', category: 'PHOTOGRAPHY', name: '8 × 10 IN (PHOTO)', dims: '8 × 10 IN', aspect: 8 / 10 },
    // Cinema
    { id: 'imax', category: 'CINEMA', name: 'IMAX DIGITAL', dims: '1.90:1', aspect: 1.90 },
    { id: 'academy', category: 'CINEMA', name: 'ACADEMY RATIO', dims: '1.375:1', aspect: 1.375 },
    // Digital
    { id: 'steam-deck', category: 'DIGITAL', name: 'STEAM DECK', dims: '1280 × 800 PX', aspect: 1280 / 800 },
    { id: 'super-wide', category: 'DIGITAL', name: 'SUPER ULTRAWIDE', dims: '32:9', aspect: 32 / 9 },
    { id: 'vertorama', category: 'DIGITAL', name: 'VERTORAMA', dims: '9:32', aspect: 9 / 32 },
    // Japanese JIS
    { id: 'jis-b4', category: 'JAPANESE JIS', name: 'JIS B4', dims: '257 × 364 MM', aspect: 257 / 364 },
    { id: 'jis-b5', category: 'JAPANESE JIS', name: 'JIS B5', dims: '182 × 257 MM', aspect: 182 / 257 },
    // Stationery
    { id: 'business-card', category: 'STATIONERY', name: 'BUSINESS CARD', dims: '3.5 × 2 IN', aspect: 3.5 / 2 },
    { id: 'postcard', category: 'STATIONERY', name: 'POSTCARD', dims: '6 × 4 IN', aspect: 6 / 4 },
  ];

  const [selectedLayoutId, setSelectedLayoutId] = useState('a4-portrait');
  const selectedLayout = layouts.find(l => l.id === selectedLayoutId) || layouts[3];
  const currentLayoutAspect = customAspectRatio ?? selectedLayout.aspect;

  const gcd = (a: number, b: number) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  };

  const normalizeRatioPair = (numerator: number, denominator: number) => {
    const n = Math.max(1, Math.round(numerator));
    const d = Math.max(1, Math.round(denominator));
    const divisor = gcd(n, d);
    return [n / divisor, d / divisor] as const;
  };

  const makePixelValues = (aspect: number) => {
    const base = 1080;
    if (aspect >= 1) {
      return [Math.max(1, Math.round(aspect * base)), base] as const;
    }
    return [base, Math.max(1, Math.round(base / aspect))] as const;
  };

  const syncFromAspect = (aspect: number) => {
    const [rw, rh] = normalizeRatioPair(Math.round(aspect * 1000), 1000);
    const [pw, ph] = makePixelValues(aspect);
    setCustomAspectRatio(aspect);
    setRatioWidth(rw);
    setRatioHeight(rh);
    setPixelWidth(pw);
    setPixelHeight(ph);
  };

  const syncFromRatioFields = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const [rw, rh] = normalizeRatioPair(width, height);
    const aspect = rw / rh;
    const [pw, ph] = makePixelValues(aspect);
    setCustomAspectRatio(aspect);
    setRatioWidth(rw);
    setRatioHeight(rh);
    setPixelWidth(pw);
    setPixelHeight(ph);
  };

  const syncFromPixelFields = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    const [rw, rh] = normalizeRatioPair(width, height);
    setCustomAspectRatio(aspect);
    setRatioWidth(rw);
    setRatioHeight(rh);
    setPixelWidth(width);
    setPixelHeight(height);
  };

  useEffect(() => {
    syncFromAspect(currentLayoutAspect);
  }, [selectedLayoutId, currentLayoutAspect]);

  const [isMapLocked, setIsMapLocked] = useState(true);
  const [isRotationEnabled, setIsRotationEnabled] = useState(false);

  const [selectedThemeId, setSelectedThemeId] = useState('midnight-blue');
  const selectedTheme = themes.find(t => t.id === selectedThemeId) || themes[0];

  const [currentColors, setCurrentColors] = useState<Record<string, string>>(() => getColorConfigFromTheme(selectedTheme));

  const updateColor = (label: string, color: string) => {
    setCurrentColors(prev => ({ ...prev, [label]: color }));
  };

  const handleThemeSelect = (themeId: string) => {
    setSelectedThemeId(themeId);
    const theme = themes.find(t => t.id === themeId);
    if (theme) {
      setCurrentColors(getColorConfigFromTheme(theme));
    }
  };

  const handleResetColors = () => {
    setCurrentColors(getColorConfigFromTheme(selectedTheme));
  };

  // Derive MapStyleColors from currentColors for generateMapStyle
  const mapStyleColors = useMemo<MapStyleColors>(() => ({
    land: currentColors['Land'],
    landcover: currentColors['Landcover'],
    water: currentColors['Water'],
    waterway: currentColors['Waterways'],
    parks: currentColors['Parks'],
    aeroway: currentColors['Aeroway'],
    buildings: currentColors['Buildings'],
    rail: currentColors['Rail'],
    roadMajor: currentColors['Roads Major'],
    roadMinorHigh: currentColors['Roads Minor High'],
    roadMinorMid: currentColors['Roads Minor Mid'],
    roadMinorLow: currentColors['Roads Minor Low'],
    roadPath: currentColors['Roads Path'],
    roadOutline: currentColors['Road Outline'],
  }), [currentColors]);

  // Generate the full MapLibre StyleSpecification — TerraInk's approach:
  // build style from scratch using raw OpenFreeMap planet vector source.
  // Recomputes only when colors or layer visibility changes.
  const mapStyle = useMemo(() => generateMapStyle({
    colors: mapStyleColors,
    showLandcover,
    showBuildings,
    showWater,
    showParks,
    showAeroway,
    showRail,
    showRoads,
  }), [mapStyleColors, showLandcover, showBuildings, showWater, showParks, showAeroway, showRail, showRoads]);

  // TerraInk's exact distance↔zoom formula
  // effectiveContainerPx = max(3300, containerPx * 5.5) — the over-zoom trick
  const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
  const TILE_SIZE_PX = 512;
  const posterContainerPxRef = useRef(600);

  // Measure actual poster width so distanceToZoom is accurate
  const [posterWidth, setPosterWidth] = useState(400);
  useEffect(() => {
    if (!posterRef.current) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        const { width } = entry.contentRect;
        if (width && width > 0) {
          posterContainerPxRef.current = width;
          setPosterWidth(width);
          // Ensure all map engines fill their containers on any layout/sidebar change
          mapRef.current?.resize();
          bgMapRef.current?.resize();
        }
      }
    });
    ro.observe(posterRef.current);
    return () => ro.disconnect();
  }, []);

  // Ensure map fills space after sidebar animation completes
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.resize();
      bgMapRef.current?.resize();
    }, 350);
    return () => clearTimeout(timer);
  }, [activeTab, selectedLayoutId]);

  const posterHeight = useMemo(() => posterWidth / currentLayoutAspect, [posterWidth, currentLayoutAspect]);
  const minPosterDim = useMemo(() => Math.min(posterWidth, posterHeight), [posterWidth, posterHeight]);

  const distanceToZoom = (distMeters: number, latDeg: number): number => {
    const effective = Math.max(3300, posterContainerPxRef.current * 5.5);
    const cosLat = Math.max(0.01, Math.cos((Math.abs(latDeg) * Math.PI) / 180));
    return Math.log2((EARTH_CIRCUMFERENCE_M * cosLat * effective) / (distMeters * 2 * TILE_SIZE_PX));
  };

  const zoomToDistance = (z: number, latDeg: number): number => {
    const effective = Math.max(3300, posterContainerPxRef.current * 5.5);
    const cosLat = Math.max(0.01, Math.cos((Math.abs(latDeg) * Math.PI) / 180));
    return Math.round((EARTH_CIRCUMFERENCE_M * cosLat * effective) / (Math.pow(2, z) * 2 * TILE_SIZE_PX));
  };

  const handleMapMoveEnd = async (viewport: { center: [number, number]; zoom: number; bearing: number; pitch: number }) => {
    const { center, zoom: newZoom } = viewport;

    setZoom(newZoom);
    setMapCenter(center);

    // Sync zoom back to distance using TerraInk's formula
    const newDistance = zoomToDistance(newZoom, center[1]);
    setDistance(newDistance);

    if (isTextManual) return;
    try {
      const addr = await reverseGeocode(center[1], center[0]);
      if (addr) {
        const place = addr.city || addr.suburb || addr.county || 'LOCATION';
        setLocName(place.toUpperCase());
        setLocCountry(addr.country.toUpperCase() || 'EARTH');
      }
    } catch (err) { }
  };

  // Sync background map position
  useEffect(() => {
    if (bgMapRef.current) {
      bgMapRef.current.jumpTo({
        center: mapCenter,
        zoom: Math.max(0, zoom - 1)
      });
    }
  }, [mapCenter, zoom]);

  // Sync distance change to zoom using TerraInk's formula
  useEffect(() => {
    if (!mapRef.current) return;
    const targetZoom = distanceToZoom(distance, mapCenter[1]);
    if (Math.abs(mapRef.current.getZoom() - targetZoom) > 0.01) {
      mapRef.current.setZoom(targetZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance]);

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setMapCenter([longitude, latitude]);
        const z = distanceToZoom(distance, latitude);
        setZoom(z);

        if (mapRef.current) {
          (mapRef.current as any).flyTo({ center: [longitude, latitude], zoom: z, duration: 1500 });
        }

        try {
          const addr = await reverseGeocode(latitude, longitude);
          if (addr) {
            const place = addr.city || addr.suburb || addr.county || 'LOCALITY';
            setLocName(place.toUpperCase());
            setLocCountry(addr.country.toUpperCase() || 'COUNTRY');
          } else {
            setLocName('CURRENT LOCATION');
            setLocCountry('GPS POSITION');
          }
        } catch (e) {
          setLocName('CURRENT LOCATION');
          setLocCountry('GPS POSITION');
        }
      },
      (error) => {
        alert('Permission denied. Please allow location access to use this feature.');
      }
    );
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=1`);
      const data = await res.json();
      const feature = data.features?.[0];

      if (feature) {
        const lon = feature.geometry.coordinates[0];
        const lat = feature.geometry.coordinates[1];

        setMapCenter([lon, lat]);
        const z = distanceToZoom(distance, lat);
        setZoom(z);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [lon, lat], zoom: z, duration: 2000 });
        }

        const addr = await reverseGeocode(lat, lon);
        if (addr) {
          const place = addr.city || addr.suburb || addr.county || feature.properties.name || 'LOCATION';
          setLocName(place.toUpperCase());
          setLocCountry(addr.country.toUpperCase() || 'COUNTRY');
        }
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleDownload = useCallback(async () => {
    if (!posterRef.current || !mapRef.current) return;

    // Detect mobile to apply safety limits
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Safety check for mobile resolution
    if (isMobile && (exportResolution === '6k' || exportResolution === '8k')) {
      const proceed = confirm('Extremely high resolutions (6K/8K) may cause your mobile browser to crash or produce a corrupted image. Would you like to proceed anyway? (2K/4K is recommended for mobile)');
      if (!proceed) return;
    }

    setExportLoading(true);
    setExportProgress(0);
    setExportStatus('PREPARING ASSETS...');

    const glCanvas = mapRef.current.getCanvas();
    const mapLayer = posterRef.current.querySelector('#map-capture-layer') as HTMLElement | null;
    const mapCanvasEl = mapLayer?.querySelector('canvas') as HTMLCanvasElement | null;
    let proxyImg: HTMLImageElement | null = null;

    try {
      // 1. Ensure all fonts are absolutely ready
      setExportStatus('LOADING FONTS...');
      if ('fonts' in document) {
        await (document as any).fonts.ready;
      }
      await new Promise(r => setTimeout(r, 500)); // Brief pause for layout settling
      setExportProgress(20);

      // 2. Capture Map GL Layer
      setExportStatus('CAPTURING MAP...');
      const mapDataUrl = await new Promise<string>((resolve) => {
        // We use a slightly more robust timeout for mobile
        const timeout = setTimeout(() => {
          try { resolve(glCanvas.toDataURL('image/png')); } catch { resolve(''); }
        }, 1500);

        mapRef.current!.once('render', () => {
          clearTimeout(timeout);
          try {
            resolve(glCanvas.toDataURL('image/png'));
          } catch {
            resolve('');
          }
        });
        mapRef.current!.triggerRepaint();
      });

      setExportProgress(50);
      setExportStatus('COMPOSITING...');

      if (mapDataUrl && mapDataUrl.length > 1000 && mapLayer) {
        proxyImg = new Image();
        proxyImg.crossOrigin = "anonymous";
        await new Promise<void>(res => {
          proxyImg!.onload = () => res();
          proxyImg!.onerror = () => res();
          proxyImg!.src = mapDataUrl;
        });
        proxyImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:5;pointer-events:none;';
        if (mapCanvasEl) mapCanvasEl.style.visibility = 'hidden';
        mapLayer.appendChild(proxyImg);
        
        // Let the DOM update
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }

      setExportProgress(75);
      setExportStatus('RENDERING FINAL IMAGE...');

      const resolutionMap = { '1k': 1024, '2k': 2048, '4k': 4096, '6k': 6144, '8k': 8192 };
      const targetLongEdge = resolutionMap[exportResolution];
      const posterEl = posterRef.current;
      const posterW = posterEl.offsetWidth;
      const posterH = posterEl.offsetHeight;
      const aspect = posterW / posterH;

      let outW: number, outH: number;
      if (posterW >= posterH) {
        outW = targetLongEdge;
        outH = Math.round(targetLongEdge / aspect);
      } else {
        outH = targetLongEdge;
        outW = Math.round(targetLongEdge * aspect);
      }

      // CRITICAL FIX: Do NOT use pixelRatio if canvasWidth/Height are explicitly set.
      // html-to-image uses canvasWidth/Height as the ACTUAL size.
      // If we also provide pixelRatio, it often scales again internally, 
      // leading to 10k+ pixel canvases on mobile which causes the noise artifact.
      const baseOpts = {
        width: posterW,
        height: posterH,
        canvasWidth: outW,
        canvasHeight: outH,
        // pixelRatio: 1, // Explicitly 1 to avoid auto-calculation glitches
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
        cacheBust: true,
        fontEmbedCSS: '', // Reduce SVG size if possible
        ... (exportFormat === 'jpg' ? { quality: 0.95 } : {}),
        filter: (node: Element) => {
          if (node === mapCanvasEl) return false;
          if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') {
            try { return !!((node as any).sheet?.cssRules); } catch { return false; }
          }
          return true;
        },
      };

      let dataUrl = '';
      const exportFn = exportFormat === 'jpg' ? toJpeg : toPng;

      try {
        dataUrl = await exportFn(posterRef.current, baseOpts);
      } catch (err) {
        console.warn('Primary export failed, attempting recovery mode...', err);
        // Fallback for extremely memory-constrained devices
        dataUrl = await exportFn(posterRef.current, {
          cacheBust: true,
          width: posterW,
          height: posterH,
          filter: (node: Element) => node !== mapCanvasEl,
        });
      }

      if (exportFormat === 'png' && exportDpi > 0 && dataUrl.startsWith('data:image/png')) {
        try {
          dataUrl = embedPngDpi(dataUrl, exportDpi);
        } catch { /* non-critical */ }
      }

      setExportStatus('EXPORT COMPLETE!');
      setExportProgress(100);
      await new Promise(r => setTimeout(r, 800));

      const baseName = locName.split(',')[0].trim().replace(/\s+/g, '_');
      setPreviewFilename(`${baseName}_Map_Poster.${exportFormat}`);
      setPreviewDataUrl(dataUrl);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to generate image. Your device might be low on memory for this resolution.');
    } finally {
      if (proxyImg && mapLayer) { try { mapLayer.removeChild(proxyImg); } catch { } }
      if (mapCanvasEl) mapCanvasEl.style.visibility = '';
      setExportLoading(false);
      setExportProgress(0);
      setExportStatus('');
    }
  }, [posterRef, mapRef, exportFormat, exportResolution, exportDpi, locName, mapCenter]);

  const handleRecenter = () => {
    if (mapRef.current) {
      (mapRef.current as any).flyTo({ center: mapCenter, zoom: zoom, duration: 1000 });
    }
  };

  const handleAddMarker = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setMarkers([...markers, {
      id,
      name: `MARKER ${markers.length + 1}`,
      coords: [mapCenter[0], mapCenter[1]]
    }]);
  };

  const handleRemoveMarker = (id: string) => {
    setMarkers(markers.filter(m => m.id !== id));
  };

  const tabs = [
    { id: 'location', label: 'LOCATION', icon: MapPin },
    { id: 'theme', label: 'THEME', icon: Palette },
    { id: 'layout', label: 'LAYOUT', icon: LayoutIcon },
    { id: 'style', label: 'STYLE', icon: Brush },
    { id: 'layers', label: 'LAYERS', icon: Layers },
    { id: 'markers', label: 'MARKERS', icon: MarkerIcon },
    { id: 'settings', label: 'SETTINGS', icon: Settings },
    { id: 'export', label: 'EXPORT', icon: Download },
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      <style jsx global>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
        /* Safe area support for notched phones */
        .safe-area-pb { padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); }
        .safe-area-pt { padding-top: env(safe-area-inset-top); }
      `}</style>

      {/* Header */}
      <header className="h-12 md:h-16 border-b border-border bg-background flex items-center justify-between px-3 md:px-6 z-50 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-5 h-5 md:w-6 md:h-6 bg-primary rounded-tr-xl rounded-bl-xl rounded-br-sm rounded-tl-sm rotate-45 flex items-center justify-center shrink-0">
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-background rounded-full"></div>
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-xs md:text-xl font-bold tracking-widest text-foreground font-sans truncate">
              CARTOGRAPHIC STUDIO
            </h1>
            <span className="hidden md:inline text-[10px] text-muted-foreground tracking-[0.2em] font-medium whitespace-nowrap">
              FREE MAP POSTER & WALLPAPER CREATOR
            </span>
          </div>
        </div>
        {/* Header Actions: Socials */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <a
            href="https://github.com/kanishkkumarsingh2004/CARTOGRAPHIC-STUDIO"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-all"
            title="GitHub Repository"
          >
            <Github className="w-4 h-4 md:w-5 md:h-5" />
          </a>
          <a
            href="https://buymeacoffee.com/kanishkkumarsingh"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-[#FFDD00] hover:bg-[#FFDD00]/10 rounded-lg transition-all"
            title="Buy Me a Coffee"
          >
            <Coffee className="w-4 h-4 md:w-5 md:h-5 fill-[#FFDD00]/10" />
          </a>
        </div>
      </header>

      <div className="flex flex-1 relative min-h-0 overflow-hidden bg-[#050810]">

        {/* Desktop left icon sidebar */}
        <aside className="hidden md:flex absolute left-0 top-0 bottom-0 w-[88px] bg-background border-r border-border flex-col items-center py-6 z-50 pointer-events-auto">
          <div className="flex flex-col gap-6 w-full">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(activeTab === tab.id ? '' : tab.id);
                    if (tab.id !== 'theme') setIsEditorOpen(false);
                    if (tab.id !== 'layout') setIsLayoutEditorOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 w-full relative transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-primary/10' : ''}`}>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                  </div>
                  <span className="text-[9px] font-bold tracking-wider">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Unified panel — desktop: left slide-in | mobile: bottom sheet */}
        <aside
          className={`
            md:flex fixed md:absolute md:left-[88px] md:top-0 md:bottom-0 md:w-[400px] md:border-r md:border-white/5
            inset-x-0 bottom-14 md:bottom-0 max-h-[65vh] md:max-h-none rounded-t-2xl md:rounded-none border-t md:border-t-0 border-white/10
            bg-[#0a0f18] z-40 md:z-30 flex flex-col overflow-hidden transition-all duration-300 ease-in-out
            ${activeTab
              ? 'translate-y-0 md:translate-x-0 opacity-100'
              : 'translate-y-full md:translate-y-0 md:-translate-x-full opacity-0 pointer-events-none'
            }
          `}
        >
          {/* Mobile drag handle */}
          <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0 cursor-pointer" onClick={() => setActiveTab('')}>
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>
          <div className="p-6 pb-4 border-b border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <form
                id="location-search-form"
                onSubmit={handleSearch}
                className="flex items-center bg-white/5 border border-white/10 rounded-lg px-3 py-2 w-full shadow-inner transition-all focus-within:border-primary/50 focus-within:bg-white/10 grow"
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a location..."
                  className="bg-transparent text-sm text-white flex-1 outline-none truncate font-sans selection:bg-primary/30"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 hover:bg-white/10 rounded text-muted-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </form>
              <button
                type="submit"
                form="location-search-form"
                className={`shrink-0 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg shadow-lg text-white transition-colors ${searchLoading ? 'opacity-50 pointer-events-none' : ''}`}
                title="Search"
              >
                {searchLoading ? (
                  <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              <button
                onClick={handleGeolocation}
                className={`shrink-0 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg shadow-lg text-white transition-colors ${searchLoading ? 'opacity-50 pointer-events-none' : ''}`}
                title="My Location"
              >
                <Crosshair className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'theme' && (
              <>
                {!isEditorOpen ? (
                  <div className="flex flex-col h-full">
                    <div className="p-6 pb-2">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase">THEME: {selectedTheme.name}</h2>
                        <button
                          onClick={() => setIsEditorOpen(!isEditorOpen)}
                          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                          title={isEditorOpen ? "Close color editor" : "Open color editor"}
                        >
                          <Brush className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-4">
                        {selectedTheme.description}
                      </p>
                    </div>

                    <div className="px-4 pb-6 space-y-3">
                      {themes.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => handleThemeSelect(theme.id)}
                          className={`w-full group text-left rounded-xl border transition-all overflow-hidden ${selectedThemeId === theme.id
                            ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/5'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'
                            }`}
                        >
                          <div className="h-24 w-full flex relative overflow-hidden">
                            {theme.colors.map((color, idx) => (
                              <div
                                key={idx}
                                className="flex-1 h-full relative"
                                style={{ backgroundColor: color }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent" />
                              </div>
                            ))}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <div className="absolute bottom-3 left-4">
                              <span className="text-xs font-bold tracking-[0.1em] text-white uppercase">{theme.name}</span>
                            </div>
                            {selectedThemeId === theme.id && (
                              <div className="absolute top-3 right-3 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-background rounded-full" />
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="p-6 pb-4">
                      <h2 className="text-sm font-bold tracking-[0.1em] text-white mb-6 uppercase">COLOR EDITOR</h2>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">Editing: Color</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleResetColors}
                            className="px-3 py-1.5 text-[10px] font-bold tracking-wider rounded border border-white/10 hover:bg-white/5 text-muted-foreground transition-colors uppercase"
                          >
                            Reset All Colors
                          </button>
                          <button
                            onClick={() => setIsEditorOpen(false)}
                            className="px-4 py-1.5 text-[10px] font-bold tracking-wider rounded bg-primary text-background hover:opacity-90 transition-all uppercase"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 pb-6">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4">
                        {colorLabels.map((label, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-2 group relative">
                            <label className="cursor-pointer">
                              <input
                                type="color"
                                value={currentColors[label]}
                                onChange={(e) => updateColor(label, e.target.value)}
                                className="sr-only"
                              />
                              <div
                                className="w-12 h-12 rounded-lg border border-white/10 shadow-inner transition-transform group-hover:scale-110 active:scale-95"
                                style={{ backgroundColor: currentColors[label] }}
                              />
                            </label>
                            <span className="text-[9px] font-bold text-muted-foreground text-center line-clamp-1 group-hover:text-white transition-colors uppercase">
                              {label.replace('Roads ', 'R. ')}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-12 pt-8 border-t border-white/5 opacity-50">
                        <div className="flex flex-col gap-4">
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full w-2/3 bg-primary/30 rounded-full" />
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full w-1/3 bg-primary/20 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'layout' && (
              <div className="flex flex-col h-full bg-[#0c111c]">
                <div className="p-6 pb-2 border-b border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase">LAYOUT: {selectedLayout.name}</h2>
                    <button
                      onClick={() => setIsLayoutEditorOpen(!isLayoutEditorOpen)}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors border border-white/10"
                      title={isLayoutEditorOpen ? "Close aspect ratio editor" : "Open aspect ratio editor"}
                    >
                      <Brush className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-4">
                    Default print ratio based on {selectedLayout.name.toLowerCase()}.
                  </p>
                  {isLayoutEditorOpen && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-1">Aspect Ratio Editor</p>
                          <p className="text-[11px] text-white/80 leading-relaxed">
                            Adjust the poster's aspect ratio manually or reset to your selected layout.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsLayoutEditorOpen(false)}
                          className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80 hover:text-white"
                        >
                          Close
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-2 block">Aspect width</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={ratioWidth}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                if (!Number.isNaN(value) && value > 0) {
                                  syncFromRatioFields(value, ratioHeight);
                                }
                              }}
                              className="w-full bg-[#0b1321] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary/50 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-2 block">Aspect height</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={ratioHeight}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                if (!Number.isNaN(value) && value > 0) {
                                  syncFromRatioFields(ratioWidth, value);
                                }
                              }}
                              className="w-full bg-[#0b1321] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary/50 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="grid gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-2 block">Width (px)</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={pixelWidth}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                if (!Number.isNaN(value) && value > 0) {
                                  syncFromPixelFields(value, pixelHeight);
                                }
                              }}
                              className="w-full bg-[#0b1321] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary/50 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-2 block">Height (px)</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={pixelHeight}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                if (!Number.isNaN(value) && value > 0) {
                                  syncFromPixelFields(pixelWidth, value);
                                }
                              }}
                              className="w-full bg-[#0b1321] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-primary/50 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 text-[11px] text-muted-foreground">
                        Computed ratio: {currentLayoutAspect.toFixed(3)}
                      </div>
                      {customAspectRatio !== null && (
                        <button
                          onClick={() => {
                            setCustomAspectRatio(null);
                            syncFromAspect(selectedLayout.aspect);
                          }}
                          className="mt-4 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.3em] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
                        >
                          Reset to {selectedLayout.name}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
                  {['PRINT', 'SOCIAL MEDIA', 'DIGITAL', 'SHAPES'].map((cat) => (
                    <div key={cat} className="space-y-4">
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">{cat}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {layouts.filter(l => l.category === cat || l.category.startsWith(cat + ' —')).map((layout) => (
                          <button
                            key={layout.id}
                            onClick={() => {
                              setSelectedLayoutId(layout.id);
                              setCustomAspectRatio(null);
                            }}
                            className={`flex flex-col text-left rounded-xl border p-3 transition-all ${selectedLayoutId === layout.id
                              ? 'border-primary/50 bg-primary/5 shadow-lg'
                              : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'
                              }`}
                          >
                            <span className="text-[9px] font-bold text-white mb-0.5 uppercase tracking-tighter truncate w-full">
                              {layout.name}
                            </span>

                            <div className="mt-auto flex items-center justify-center h-20 w-full bg-[#1a1f2b] rounded-lg border border-white/5 overflow-hidden">
                              <div
                                className={`bg-primary/30 border border-primary/20 shadow-sm transition-all duration-300 ${layout.aspect > 1 ? 'w-[70%] h-[40%]' : 'w-[40%] h-[70%]'} ${(layout as any).isCircular ? 'rounded-full' : 'rounded-sm'}`}
                                style={{ aspectRatio: layout.aspect }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'style' && (
              <div className="flex flex-col h-full">
                <div className="p-6 pb-4 border-b border-white/5">
                  <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase mb-1">STYLE</h2>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                    Customize the poster appearance and text.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
                  {/* Toggle: Poster Text */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Poster text</span>
                    <button
                      onClick={() => setShowPosterText(!showPosterText)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${showPosterText ? 'bg-primary' : 'bg-white/10'
                        }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${showPosterText ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                    </button>
                  </div>

                  {/* Toggle: Overlay Layer */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Overlay layer</span>
                    <button
                      onClick={() => setShowOverlay(!showOverlay)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${showOverlay ? 'bg-primary' : 'bg-white/10'
                        }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${showOverlay ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                    </button>
                  </div>

                  {/* Corner Rounding Control */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">CORNER ROUNDING</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                          {(selectedLayout as any).isCircular ? 'CIRCLE' : `${cornerRadius}PX`}
                        </span>
                        <button
                          onClick={() => setCornerRadius(8)}
                          className="p-1 px-2 text-[8px] font-bold tracking-widest text-muted-foreground hover:text-white uppercase border border-white/5 bg-white/5 rounded transition-all"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="500"
                        step="1"
                        value={(selectedLayout as any).isCircular ? 500 : cornerRadius}
                        disabled={(selectedLayout as any).isCircular}
                        onChange={(e) => setCornerRadius(parseInt(e.target.value))}
                        className={`flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary ${(selectedLayout as any).isCircular ? 'opacity-30 cursor-not-allowed' : ''
                          }`}
                        style={{
                          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(((selectedLayout as any).isCircular ? 500 : cornerRadius) / 500) * 100}%, rgba(255,255,255,0.1) ${(((selectedLayout as any).isCircular ? 500 : cornerRadius) / 500) * 100}%, rgba(255,255,255,0.1) 100%)`
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed uppercase">
                      {(selectedLayout as any).isCircular
                        ? 'Rounding is fixed for circular layouts.'
                        : 'Adjust the sharpness or roundness of the poster edges.'}
                    </p>
                  </div>

                  {/* Editable City & Country */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Display city</label>
                      <input
                        type="text"
                        value={locName}
                        onChange={(e) => { setIsTextManual(true); setLocName(e.target.value.toUpperCase()); }}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Display country</label>
                      <input
                        type="text"
                        value={locCountry}
                        onChange={(e) => { setIsTextManual(true); setLocCountry(e.target.value.toUpperCase()); }}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Latitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="-90"
                        max="90"
                        value={mapCenter[1].toFixed(4)}
                        onChange={(e) => {
                          const lat = parseFloat(e.target.value);
                          if (!Number.isNaN(lat)) {
                            setMapCenter([mapCenter[0], lat]);
                          }
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Longitude</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="-180"
                        max="180"
                        value={mapCenter[0].toFixed(4)}
                        onChange={(e) => {
                          const lon = parseFloat(e.target.value);
                          if (!Number.isNaN(lon)) {
                            setMapCenter([lon, mapCenter[1]]);
                          }
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Font Selector */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block">Font</label>
                    <div className="relative">
                      <select
                        value={selectedFont}
                        onChange={(e) => setSelectedFont(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none focus:border-primary/50 focus:outline-none transition-colors cursor-pointer"
                      >
                        {fontOptions.map(font => (
                          <option key={font} value={font} className="bg-[#0c111c] text-white">
                            {font === 'Space Grotesk' ? `Default (${font})` : font}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  {/* Font Size */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-muted-foreground">City font size</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                          {fontSizeOverride ?? Math.round(Math.max(12, minPosterDim * 0.12))}px
                        </span>
                        {fontSizeOverride !== null && (
                          <button
                            onClick={() => setFontSizeOverride(null)}
                            className="text-[9px] font-bold tracking-widest text-muted-foreground hover:text-white uppercase border border-white/5 bg-white/5 px-2 py-0.5 rounded transition-all"
                          >
                            Auto
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="8"
                        max="200"
                        step="1"
                        value={fontSizeOverride ?? Math.round(Math.max(12, minPosterDim * 0.12))}
                        onChange={(e) => setFontSizeOverride(parseInt(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
                        style={{
                          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(((fontSizeOverride ?? Math.round(Math.max(12, minPosterDim * 0.12))) - 8) / 192) * 100}%, rgba(255,255,255,0.1) ${(((fontSizeOverride ?? Math.round(Math.max(12, minPosterDim * 0.12))) - 8) / 192) * 100}%, rgba(255,255,255,0.1) 100%)`
                        }}
                      />
                      <input
                        type="number"
                        min="8"
                        max="500"
                        value={fontSizeOverride ?? Math.round(Math.max(12, minPosterDim * 0.12))}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (!isNaN(v) && v >= 8) setFontSizeOverride(v);
                        }}
                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:border-primary/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Country font size */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-muted-foreground">Country font size</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                          {countrySizeOverride ?? Math.round(Math.max(8, minPosterDim * 0.05))}px
                        </span>
                        {countrySizeOverride !== null && (
                          <button onClick={() => setCountrySizeOverride(null)} className="text-[9px] font-bold tracking-widest text-muted-foreground hover:text-white uppercase border border-white/5 bg-white/5 px-2 py-0.5 rounded transition-all">Auto</button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min="6" max="150" step="1"
                        value={countrySizeOverride ?? Math.round(Math.max(8, minPosterDim * 0.05))}
                        onChange={(e) => setCountrySizeOverride(parseInt(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
                        style={{ background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(((countrySizeOverride ?? Math.round(Math.max(8, minPosterDim * 0.05))) - 6) / 144) * 100}%, rgba(255,255,255,0.1) ${(((countrySizeOverride ?? Math.round(Math.max(8, minPosterDim * 0.05))) - 6) / 144) * 100}%, rgba(255,255,255,0.1) 100%)` }}
                      />
                      <input
                        type="number" min="6" max="500"
                        value={countrySizeOverride ?? Math.round(Math.max(8, minPosterDim * 0.05))}
                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 6) setCountrySizeOverride(v); }}
                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:border-primary/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Coordinates font size */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-muted-foreground">Coordinates font size</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                          {coordSizeOverride ?? Math.round(Math.max(6, minPosterDim * 0.035))}px
                        </span>
                        {coordSizeOverride !== null && (
                          <button onClick={() => setCoordSizeOverride(null)} className="text-[9px] font-bold tracking-widest text-muted-foreground hover:text-white uppercase border border-white/5 bg-white/5 px-2 py-0.5 rounded transition-all">Auto</button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min="4" max="100" step="1"
                        value={coordSizeOverride ?? Math.round(Math.max(6, minPosterDim * 0.035))}
                        onChange={(e) => setCoordSizeOverride(parseInt(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
                        style={{ background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(((coordSizeOverride ?? Math.round(Math.max(6, minPosterDim * 0.035))) - 4) / 96) * 100}%, rgba(255,255,255,0.1) ${(((coordSizeOverride ?? Math.round(Math.max(6, minPosterDim * 0.035))) - 4) / 96) * 100}%, rgba(255,255,255,0.1) 100%)` }}
                      />
                      <input
                        type="number" min="4" max="500"
                        value={coordSizeOverride ?? Math.round(Math.max(6, minPosterDim * 0.035))}
                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 4) setCoordSizeOverride(v); }}
                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:border-primary/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Text Spacing */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-muted-foreground">Text Spacing</label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                          {textSpacingOverride ?? Math.round(posterWidth * 0.025)}px
                        </span>
                        {textSpacingOverride !== null && (
                          <button onClick={() => setTextSpacingOverride(null)} className="text-[9px] font-bold tracking-widest text-muted-foreground hover:text-white uppercase border border-white/5 bg-white/5 px-2 py-0.5 rounded transition-all">Auto</button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min="0" max="250" step="1"
                        value={textSpacingOverride ?? Math.round(posterWidth * 0.025)}
                        onChange={(e) => setTextSpacingOverride(parseInt(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
                        style={{ background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((textSpacingOverride ?? Math.round(posterWidth * 0.025)) / 250) * 100}%, rgba(255,255,255,0.1) ${((textSpacingOverride ?? Math.round(posterWidth * 0.025)) / 250) * 100}%, rgba(255,255,255,0.1) 100%)` }}
                      />
                      <input
                        type="number" min="0" max="800"
                        value={textSpacingOverride ?? Math.round(posterWidth * 0.025)}
                        onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0) setTextSpacingOverride(v); }}
                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:border-primary/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Font Preview */}
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] relative h-32 overflow-hidden">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 relative z-10">Font Preview</p>
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                      <div className="scale-90 origin-center">
                        <h1
                          className="font-black tracking-[0.4em] text-white leading-none mb-3"
                          style={{ fontFamily: selectedFont, fontSize: '20px' }}
                        >
                          {locName || 'CITY NAME'}
                        </h1>
                        <div className="w-12 h-[1px] bg-white/20 mb-3 mx-auto" />
                        <p
                          className="tracking-[0.4em] text-white/60 uppercase"
                          style={{ fontFamily: selectedFont, fontSize: '9px' }}
                        >
                          {locCountry || 'COUNTRY'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'layers' && (
              <div className="flex flex-col h-full bg-[#0c111c]">
                <div className="p-6 pb-4 border-b border-white/5">
                  <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase mb-1">LAYERS</h2>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 custom-scrollbar">
                  {[
                    { label: 'Show landcover', state: showLandcover, setter: setShowLandcover },
                    { label: 'Show buildings', state: showBuildings, setter: setShowBuildings },
                    { label: 'Show water', state: showWater, setter: setShowWater },
                    { label: 'Show parks', state: showParks, setter: setShowParks },
                    { label: 'Show roads', state: showRoads, setter: setShowRoads },
                    { label: 'Show rail', state: showRail, setter: setShowRail },
                    { label: 'Show aeroway', state: showAeroway, setter: setShowAeroway },
                  ].map(({ label, state, setter }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{label}</span>
                      <button
                        onClick={() => setter(!state)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${state ? 'bg-primary' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${state ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  ))}

                  <div className="pt-4 border-t border-white/5">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase mb-4">MAP DETAILS</h3>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-white">Distance (m)</span>
                      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 min-w-[110px] flex justify-end shadow-inner">
                        <input
                          type="text"
                          value={distance}
                          onChange={(e) => {
                            const val = parseInt(e.target.value.replace(/\D/g, ''));
                            if (!isNaN(val) && val > 0) setDistance(val);
                          }}
                          className="bg-transparent text-right text-white font-bold text-base outline-none w-full"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min="4.6"
                      max="16.8"
                      step="0.01"
                      value={Math.log(Math.max(100, distance))}
                      onChange={(e) => setDistance(Math.round(Math.exp(parseFloat(e.target.value))))}
                      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                      style={{
                        background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((Math.log(Math.max(100, distance)) - 4.6) / (16.8 - 4.6)) * 100}%, rgba(255,255,255,0.1) ${((Math.log(Math.max(100, distance)) - 4.6) / (16.8 - 4.6)) * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    <div className="flex justify-between mt-2">
                      {['100 m', '100K m', '1M m', '20M m'].map(l => (
                        <span key={l} className="text-[9px] text-muted-foreground font-mono">{l}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'markers' && (
              <div className="flex flex-col h-full bg-[#0c111c]">
                <div className="p-6 pb-4 border-b border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase">MARKERS</h2>
                    <button
                      onClick={handleAddMarker}
                      className="px-3 py-1.5 bg-primary text-black rounded-lg text-[10px] font-black tracking-widest hover:opacity-90 transition-all uppercase"
                    >
                      Add Pin at Center
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed uppercase">
                    Place and manage custom map annotations.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 custom-scrollbar">
                  {markers.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                      <MarkerIcon className="w-8 h-8 mb-4 text-muted-foreground" />
                      <p className="text-xs font-bold text-muted-foreground tracking-widest">NO MARKERS ADDED</p>
                    </div>
                  ) : (
                    markers.map((marker) => (
                      <div key={marker.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded bg-primary/10 text-primary">
                            <MarkerIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <input
                              type="text"
                              value={marker.name}
                              onChange={(e) => {
                                setMarkers(markers.map(m => m.id === marker.id ? { ...m, name: e.target.value.toUpperCase() } : m));
                              }}
                              className="bg-transparent text-xs font-bold text-white uppercase outline-none focus:text-primary transition-colors"
                            />
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {marker.coords[1].toFixed(4)}, {marker.coords[0].toFixed(4)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveMarker(marker.id)}
                          className="p-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="flex flex-col h-full bg-[#0c111c]">
                <div className="p-6 pb-4 border-b border-white/5">
                  <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase mb-1">SETTINGS</h2>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed uppercase">
                    General application and view preferences.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">VIEW CONTROLS</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Map Lock</span>
                      <button
                        onClick={() => setIsMapLocked(!isMapLocked)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isMapLocked ? 'bg-primary' : 'bg-white/10'
                          }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${isMapLocked ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Allow Rotation</span>
                      <button
                        onClick={() => setIsRotationEnabled(!isRotationEnabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isRotationEnabled ? 'bg-primary' : 'bg-white/10'
                          }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${isRotationEnabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                      </button>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Map Zoom</h4>
                        <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {zoom.toFixed(1)}z
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => { const z = Math.max(1, zoom - 1); setZoom(z); mapRef.current?.zoomTo(z); }}
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          step="0.1"
                          value={zoom}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setZoom(val);
                            mapRef.current?.setZoom(val);
                          }}
                          className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                          style={{
                            background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((zoom - 1) / 19) * 100}%, rgba(255,255,255,0.1) ${((zoom - 1) / 19) * 100}%, rgba(255,255,255,0.1) 100%)`
                          }}
                        />
                        <button
                          onClick={() => { const z = Math.min(20, zoom + 1); setZoom(z); mapRef.current?.zoomTo(z); }}
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isRotationEnabled && (
                      <div className="space-y-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Map Rotation</h4>
                          <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            {Math.round(bearing)}°
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                            value={bearing}
                            onChange={(e) => setBearing(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                            style={{
                              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(bearing / 360) * 100}%, rgba(255,255,255,0.1) ${(bearing / 360) * 100}%, rgba(255,255,255,0.1) 100%)`
                            }}
                          />
                          <button
                            onClick={() => setBearing(0)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-muted-foreground hover:text-white transition-colors"
                            title="Reset Heading"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">POSTER DECORATIONS</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Show Text</span>
                      <button
                        onClick={() => setShowPosterText(!showPosterText)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${showPosterText ? 'bg-primary' : 'bg-white/10'
                          }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${showPosterText ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Background Overlay</span>
                      <button
                        onClick={() => setShowOverlay(!showOverlay)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${showOverlay ? 'bg-primary' : 'bg-white/10'
                          }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${showOverlay ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Show Info HUD</span>
                      <button
                        onClick={() => setShowHUD(!showHUD)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${showHUD ? 'bg-primary' : 'bg-white/10'
                          }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${showHUD ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'location' && (
              <div className="p-6">
                <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase mb-4">Saved Locations</h2>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between group hover:bg-white/[0.05] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-primary/10 text-primary">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white uppercase">Current View</p>
                        <p className="text-[10px] text-muted-foreground">{locName}, {locCountry}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase mb-1">DYNAMIC NAMING</h3>
                        <p className="text-[10px] text-muted-foreground uppercase">Update labels as you move</p>
                      </div>
                      <button
                        onClick={() => setIsAutoLocation(!isAutoLocation)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isAutoLocation ? 'bg-primary' : 'bg-white/10'
                          }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${isAutoLocation ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {activeTab === 'export' && (
              <div className="flex flex-col h-full bg-[#0c111c]">
                <div className="p-6 pb-4 border-b border-white/5">
                  <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase mb-1">EXPORT SETTINGS</h2>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed uppercase">
                    Configure your high-resolution output preferences.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">FILE FORMAT</h3>
                    <div className="flex gap-2">
                      {(['png', 'jpg'] as const).map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setExportFormat(fmt)}
                          className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all uppercase ${exportFormat === fmt
                              ? 'bg-primary text-black border-transparent shadow-lg shadow-primary/10'
                              : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                            }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {exportFormat === 'png'
                        ? 'Lossless compression, supports DPI metadata. Best for high-quality printing.'
                        : 'Efficient compression, standard quality. Great for sharing on social media.'}
                    </p>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">RESOLUTION</h3>
                    <div className="grid grid-cols-5 gap-2">
                      {(['1k', '2k', '4k', '6k', '8k'] as const).map(res => (
                        <button
                          key={res}
                          onClick={() => setExportResolution(res)}
                          className={`py-2.5 rounded-lg border font-bold text-[10px] transition-all uppercase ${exportResolution === res
                              ? 'bg-white text-black border-transparent shadow-lg'
                              : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                            }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Estimated Size</span>
                      <span className="text-[11px] font-mono text-white">
                        {exportResolution === '1k' ? '~1024 px' :
                          exportResolution === '2k' ? '~2048 px' :
                            exportResolution === '4k' ? '~4096 px' :
                              exportResolution === '6k' ? '~6144 px' : '~8192 px'} (Long Edge)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">PRINT DENSITY (DPI)</h3>
                      <span className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        {exportDpi}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="72"
                      max="600"
                      step="1"
                      value={exportDpi}
                      onChange={(e) => setExportDpi(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                      style={{
                        background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((exportDpi - 72) / (600 - 72)) * 100}%, rgba(255,255,255,0.1) ${((exportDpi - 72) / (600 - 72)) * 100}%, rgba(255,255,255,0.1) 100%)`
                      }}
                    />
                    <div className="flex justify-between">
                      <span className="text-[9px] text-muted-foreground font-mono">72 (Web)</span>
                      <span className="text-[9px] text-muted-foreground font-mono">300 (Print)</span>
                      <span className="text-[9px] text-muted-foreground font-mono">600 (HD)</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed uppercase">
                      Higher DPI improves print sharpness but increases file size. 300 is recommended for professional printing.
                    </p>
                  </div>

                  <div className="pt-8">
                    <button
                      onClick={handleDownload}
                      disabled={exportLoading}
                      className="w-full py-4 bg-primary text-black font-black tracking-[0.2em] text-xs rounded-xl shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none uppercase flex items-center justify-center gap-3"
                    >
                      {exportLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {exportLoading ? 'GENERATING...' : 'GENERATE POSTER'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className={`flex-1 relative w-full h-full min-h-0 flex flex-col items-center justify-center p-2 md:p-6 pb-[72px] md:pb-6 transition-all duration-300 ease-in-out ${activeTab ? 'md:pl-[488px]' : 'md:pl-[88px]'}`}>
          {/* Synchronized Background Map */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden grayscale-[0.3] opacity-40 bg-[#050810]">
            <div className="absolute inset-0 blur-sm scale-110">
              <Map
                ref={bgMapRef}
                styles={{ dark: mapStyle as any, light: mapStyle as any }}
                center={mapCenter}
                zoom={zoom - 1}
                bearing={bearing}
                overzoomScale={5.5}
                className="w-full h-full"
                dragPan={false}
                scrollZoom={false}
                boxZoom={false}
                dragRotate={false}
                keyboard={false}
                doubleClickZoom={false}
                touchZoomRotate={false}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#050810]/40 via-transparent to-[#050810]/60" />
          </div>
          <div className="z-20 flex flex-col items-center gap-4 md:gap-6 w-full max-w-full overflow-hidden px-2 md:px-4">
            <div
              ref={posterRef}
              className={`relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border overflow-hidden ring-1 ring-white/10 flex flex-col pointer-events-auto shrink transition-all duration-500 mx-auto`}
              style={{
                backgroundColor: currentColors['Land'],
                borderColor: currentColors['Road Outline'],
                aspectRatio: currentLayoutAspect,
                borderRadius: (selectedLayout as any).isCircular ? '50%' : `${cornerRadius}px`,
                width: `min(94vw, calc(78vh * ${currentLayoutAspect}))`,
                maxWidth: '100%',
                maxHeight: '78vh',
                height: 'auto',
              }}
            >
              <div id="map-capture-layer" className="absolute inset-0">
                <Map
                  ref={mapRef}
                  styles={{ dark: mapStyle as any, light: mapStyle as any }}
                  center={mapCenter}
                  zoom={zoom}
                  bearing={bearing}
                  onMoveEnd={handleMapMoveEnd}
                  overzoomScale={5.5}
                  className="w-full h-full"
                  dragPan={!isMapLocked}
                  scrollZoom={!isMapLocked}
                  boxZoom={!isMapLocked}
                  dragRotate={!isMapLocked && isRotationEnabled}
                  keyboard={!isMapLocked}
                  doubleClickZoom={!isMapLocked}
                  touchZoomRotate={!isMapLocked}
                >
                  {markers.map((marker) => (
                    <MapMarker
                      key={marker.id}
                      longitude={marker.coords[0]}
                      latitude={marker.coords[1]}
                    >
                      <MarkerContent>
                        <div className="group relative flex flex-col items-center">
                          {/* Marker Label */}
                          <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-md border border-white/10 px-2 py-1 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-xl z-50">
                            {marker.name}
                          </div>
                          {/* Marker Pin */}
                          <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-md rounded-full scale-150 animate-pulse" />
                            <div className="relative p-1.5 bg-background border-2 border-primary rounded-full shadow-2xl transition-transform group-hover:scale-110 active:scale-95">
                              <MapPin className="w-3.5 h-3.5 text-primary" />
                            </div>
                          </div>
                        </div>
                      </MarkerContent>
                    </MapMarker>
                  ))}
                </Map>
              </div>

              <PosterMarkerOverlay
                mapRef={mapRef}
                markers={markers}
                textColor={currentColors['Text']}
              />

              {showOverlay && (
                <>
                  <div
                    className="absolute top-0 left-0 right-0 h-32 z-10 pointer-events-none transition-opacity duration-500"
                    style={{ background: `linear-gradient(to bottom, ${currentColors['Overlay']}, ${currentColors['Overlay']}99, transparent)` }}
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 h-48 z-10 pointer-events-none transition-opacity duration-500"
                    style={{ background: `linear-gradient(to top, ${currentColors['Overlay']}, ${currentColors['Overlay']}cc, transparent)` }}
                  />
                </>
              )}

              {showPosterText && (
                <div className="absolute bottom-[8%] left-0 w-full flex flex-col items-center justify-center z-20 pointer-events-none px-[6%]">
                  <h2
                    className="leading-none font-bold text-center w-full"
                    style={{
                      color: currentColors['Text'],
                      fontFamily: selectedFont,
                      fontSize: `${fontSizeOverride ?? Math.max(12, minPosterDim * 0.12)}px`,
                      letterSpacing: '0.18em',
                      marginBottom: `${textSpacingOverride ?? (posterWidth * 0.025)}px`,
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                    suppressHydrationWarning
                  >
                    {locName}
                  </h2>

                  <p
                    className="font-black text-center opacity-80"
                    style={{
                      color: currentColors['Text'],
                      fontSize: `${countrySizeOverride ?? Math.max(8, minPosterDim * 0.05)}px`,
                      letterSpacing: '0.5em',
                      marginBottom: `${(textSpacingOverride ? (textSpacingOverride * 0.72) : (posterWidth * 0.018))}px`,
                    }}
                    suppressHydrationWarning
                  >
                    {locCountry}
                  </p>

                  <p
                    className="font-mono text-center"
                    style={{
                      color: `${currentColors['Text']}b3`,
                      fontSize: `${coordSizeOverride ?? Math.max(6, minPosterDim * 0.035)}px`,
                      letterSpacing: '0.15em',
                    }}
                    suppressHydrationWarning
                  >
                    {Math.abs(mapCenter[1]).toFixed(4)}° {mapCenter[1] >= 0 ? 'N' : 'S'} / {Math.abs(mapCenter[0]).toFixed(4)}° {mapCenter[0] >= 0 ? 'E' : 'W'}
                  </p>
                </div>
              )}

            </div>





            {/* Credits — mobile only, shown below buttons */}
            <p className="md:hidden text-[9px] font-mono tracking-[0.2em] text-white/40 uppercase text-center">
              © 2026 Cartographic Studio
            </p>
          </div>

          {/* Current Settings — large devices only */}
          {showHUD && (
            <div className="hidden lg:block absolute bottom-20 right-12 z-30 pointer-events-none">
              <div className="bg-[#0a0f18]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl min-w-[340px] animate-in fade-in slide-in-from-right-4 duration-500">
                <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase mb-4">CURRENT SETTINGS</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">LOCATION</p>
                    <p className="text-[13px] font-bold text-white truncate max-w-[140px] uppercase">{locName || 'Unknown'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">THEME</p>
                    <p className="text-[13px] font-bold text-white uppercase">{selectedTheme.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">LAYOUT</p>
                    <p className="text-[13px] font-bold text-white uppercase">{selectedLayout.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">POSTER SIZE</p>
                    <p className="text-[13px] font-bold text-white uppercase">{selectedLayout.dims}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">MARKERS</p>
                    <p className="text-[13px] font-bold text-white uppercase">{markers.length} markers</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">COORDINATES</p>
                    <p className="text-[13px] font-bold text-white font-mono">{mapCenter[1].toFixed(4)}, {mapCenter[0].toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Credits Footer — desktop only */}
          <footer className="hidden md:block mt-auto py-6 w-full text-center z-10 text-white opacity-100 transition-opacity duration-500">
            <p className="text-[10px] font-mono tracking-[0.3em] text-white uppercase flex flex-wrap items-center justify-center gap-2">
              © 2026 All Rights Reserved <span className="opacity-80">|</span> Made with <span className="text-red-500 animate-pulse">❤️</span> by Kanishk Kumar Singh
            </p>
          </footer>

          {/* Mobile bottom tab bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border flex items-center justify-around px-1 pt-1.5 pb-safe safe-area-pb" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(activeTab === tab.id ? '' : tab.id);
                    if (tab.id !== 'theme') setIsEditorOpen(false);
                  }}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 flex-1 ${isActive ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.5 : 1.5} />
                  <span className="text-[7px] font-bold tracking-wide truncate w-full text-center">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </main>
      </div>
      <ExportProgress
        isVisible={exportLoading}
        progress={exportProgress}
        status={exportStatus}
      />

      {/* Preview Dialog */}
      {previewDataUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="flex flex-col bg-[#0a0f18] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-full max-w-2xl animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5">
              <div>
                <p className="text-xs font-black tracking-[0.3em] text-white uppercase">Preview</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px] sm:max-w-none">{previewFilename}</p>
              </div>
              <button
                onClick={() => setPreviewDataUrl(null)}
                className="p-2 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="p-3 sm:p-4 bg-[#050810]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewDataUrl}
                alt="Map poster preview"
                className="w-full rounded-lg object-contain max-h-[45vh] sm:max-h-[60vh]"
              />
            </div>

            {/* Actions */}
            <div className="border-t border-white/5 p-4 sm:p-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <button
                  onClick={() => setPreviewDataUrl(null)}
                  className="w-full sm:flex-1 py-3.5 text-xs font-bold tracking-wider rounded-xl border border-white/10 hover:bg-white/5 text-muted-foreground transition-all uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.download = previewFilename;
                    link.href = previewDataUrl!;
                    link.click();
                  }}
                  className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 bg-white hover:bg-gray-100 rounded-xl text-black font-black tracking-[0.15em] text-xs shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  DOWNLOAD POSTER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPoster;
