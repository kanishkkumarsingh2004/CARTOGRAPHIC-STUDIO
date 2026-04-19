'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, MapPin, Palette, Layout as LayoutIcon, Brush, 
  Layers, MapPin as MarkerIcon, Settings, Crosshair, MapPinOff, 
  Search, Github, Instagram, Coffee, Info, X, Lock as LockIcon, Unlock, RefreshCw
} from 'lucide-react';
import { Map, MapMarker, MarkerContent, MarkerPopup } from '@/components/ui/map';

const MapPoster = () => {
  const [activeTab, setActiveTab] = useState('theme'); // Default to theme to see changes
  const [exportLoading, setExportLoading] = useState(false);
  const mapRef = useRef<any>(null);
  const [zoom, setZoom] = useState(13);
  const [mapCenter, setMapCenter] = useState<[number, number]>([77.4402, 12.6408]);
  const [locName, setLocName] = useState('HAROHALLI TALUK');
  const [locCountry, setLocCountry] = useState('INDIA');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showPosterText, setShowPosterText] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [selectedFont, setSelectedFont] = useState('Space Grotesk');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Layer visibility toggles
  const [showLandcover, setShowLandcover] = useState(true);
  const [showBuildings, setShowBuildings] = useState(false);
  const [showWater, setShowWater] = useState(true);
  const [showParks, setShowParks] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showRail, setShowRail] = useState(true);
  const [showAeroway, setShowAeroway] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [distance, setDistance] = useState(4000);
  const [markers, setMarkers] = useState<{id: string, name: string, coords: [number, number]}[]>([]);

  const fontOptions = [
    'Space Grotesk', 'Inter', 'Playfair Display', 'Roboto Mono', 
    'DM Sans', 'Outfit', 'Crimson Text', 'JetBrains Mono'
  ];

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
    { id: 'a1-portrait', category: 'PRINT', name: 'A1 PORTRAIT', dims: '59.4 x 84.1 CM', aspect: 1/1.414 },
    { id: 'a2-portrait', category: 'PRINT', name: 'A2 PORTRAIT', dims: '42 x 59.4 CM', aspect: 1/1.414 },
    { id: 'a3-portrait', category: 'PRINT', name: 'A3 PORTRAIT', dims: '29.7 x 42 CM', aspect: 1/1.414 },
    { id: 'a4-portrait', category: 'PRINT', name: 'A4 PORTRAIT', dims: '21 x 29.7 CM', aspect: 1/1.414 },
    { id: 'a5-portrait', category: 'PRINT', name: 'A5 PORTRAIT', dims: '14.8 x 21 CM', aspect: 1/1.414 },
    { id: 'us-letter', category: 'PRINT', name: 'LETTER (US)', dims: '21.6 x 27.9 CM', aspect: 21.6/27.9 },
    { id: 'inst-square', category: 'SOCIAL MEDIA', name: 'INSTAGRAM SQUARE', dims: '1080 x 1080 PX', aspect: 1/1 },
    { id: 'inst-port', category: 'SOCIAL MEDIA', name: 'INSTAGRAM PORTRAIT', dims: '1080 x 1350 PX', aspect: 1080/1350 },
    { id: 'story', category: 'SOCIAL MEDIA', name: 'STORY (9:16)', dims: '1080 x 1920 PX', aspect: 9/16 },
    { id: 'linkedin-post', category: 'SOCIAL MEDIA', name: 'LINKEDIN POST', dims: '1200 x 627 PX', aspect: 1200/627 },
    { id: 'linkedin-cover', category: 'SOCIAL MEDIA', name: 'LINKEDIN COVER', dims: '1584 x 396 PX', aspect: 1584/396 },
    { id: 'pinterest', category: 'SOCIAL MEDIA', name: 'PINTEREST PIN', dims: '1000 x 1500 PX', aspect: 1000/1500 },
    { id: 'desktop', category: 'DIGITAL', name: 'DESKTOP WALLPAPER', dims: '1920 x 1080 PX', aspect: 1920/1080 },
    { id: 'phone', category: 'DIGITAL', name: 'PHONE WALLPAPER', dims: '1170 x 2532 PX', aspect: 1170/2532 },
  ];

  const [selectedLayoutId, setSelectedLayoutId] = useState('a4-portrait');
  const selectedLayout = layouts.find(l => l.id === selectedLayoutId) || layouts[3];

  const [isMapLocked, setIsMapLocked] = useState(false);
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

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const layerMapping: Record<string, { patterns: string[] }> = {
      'Land': { patterns: ['background', 'landcover', 'landuse', 'natural', 'wood', 'scrub', 'grass', 'glacier', 'sand', 'rock'] },
      'Water': { patterns: ['water', 'ocean', 'sea', 'lake', 'reservoir'] },
      'Waterways': { patterns: ['waterway', 'river', 'canal', 'stream', 'drain', 'ditch'] },
      'Parks': { patterns: ['park', 'garden', 'greenery', 'recreation', 'leisure', 'nature_reserve', 'golf_course'] },
      'Buildings': { patterns: ['building', 'construction', 'roof'] },
      'Landcover': { patterns: ['landcover', 'landuse_area', 'farmland', 'farmyard', 'industrial', 'commercial', 'residential_area'] },
      'Aeroway': { patterns: ['aeroway', 'airport', 'runway', 'taxiway', 'apron', 'terminal'] },
      'Rail': { patterns: ['railway', 'rail', 'transit', 'transportation', 'train', 'station', 'monorail', 'subway', 'tram', 'light_rail'] },
      'Roads Major': { patterns: ['road_major', 'road_primary', 'road_secondary', 'road_trunk', 'road_motorway', 'motorway', 'trunk', 'primary', 'secondary'] },
      'Roads Minor High': { patterns: ['road_minor', 'road_tertiary', 'tertiary'] },
      'Roads Minor Mid': { patterns: ['road_residential', 'road_street', 'residential', 'street'] },
      'Roads Minor Low': { patterns: ['road_service', 'road_link', 'service', 'link', 'living_street'] },
      'Roads Path': { patterns: ['road_path', 'road_track', 'road_pedestrian', 'path', 'track', 'pedestrian', 'footway', 'cycleway', 'steps', 'corridor', 'bridleway'] },
      'Road Outline': { patterns: ['road_outline', 'road_case', 'case', 'outline'] },
    };

    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        applyColors();
        map.off('styledata', onStyleLoad);
      };
      map.on('styledata', onStyleLoad);
      return;
    }

    applyColors();

    function applyColors() {
      const layers = map.getStyle().layers;
      if (!layers) return;

      Object.entries(layerMapping).forEach(([label, config]) => {
        const color = currentColors[label];
        if (!color) return;

        config.patterns.forEach(pattern => {
          layers.forEach((l: any) => {
            const isMatch = l.id.toLowerCase().includes(pattern.toLowerCase()) || 
                          (l.source_layer && l.source_layer.toLowerCase().includes(pattern.toLowerCase()));
            
            if (isMatch) {
               try {
                 // Determine correct property based on layer type
                 let prop = '';
                 if (l.type === 'fill') prop = 'fill-color';
                 else if (l.type === 'line') prop = 'line-color';
                 else if (l.type === 'background') prop = 'background-color';
                 else if (l.type === 'symbol') prop = 'text-color';
                 
                 if (prop) {
                   map.setPaintProperty(l.id, prop, color);
                 }
               } catch (e) {}
            }
          });
        });
      });
    }
  }, [currentColors, mapRef]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (isMapLocked) {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.dragRotate.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
    } else {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      
      if (isRotationEnabled) {
        map.dragRotate.enable();
      } else {
        map.dragRotate.disable();
      }
    }
  }, [isMapLocked, isRotationEnabled, mapRef]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const handleMove = () => {
      const newZoom = map.getZoom();
      setZoom(newZoom);
      // Sync zoom back to distance: distance = 2^ (24.5 - zoom)
      const newDistance = Math.round(Math.pow(2, 24.5 - newZoom));
      setDistance(newDistance);
    };

    map.on('move', handleMove);
    return () => map.off('move', handleMove);
  }, [mapRef]);

  // Sync distance change to zoom
  useEffect(() => {
    if (!mapRef.current) return;
    const targetZoom = 24.5 - Math.log2(distance);
    if (Math.abs(mapRef.current.getZoom() - targetZoom) > 0.01) {
      mapRef.current.setZoom(targetZoom);
    }
  }, [distance, mapRef]);

  // Layer visibility effect
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (!map.isStyleLoaded()) return;

    const layers = map.getStyle()?.layers;
    if (!layers) return;

    const layerVisibility: Record<string, boolean> = {
      'landcover': showLandcover,
      'landuse': showLandcover,
      'building': showBuildings,
      'water': showWater,
      'park': showParks,
      'greenery': showParks,
      'road': showRoads,
      'motorway': showRoads,
      'trunk': showRoads,
      'primary': showRoads,
      'secondary': showRoads,
      'tertiary': showRoads,
      'residential': showRoads,
      'street': showRoads,
      'service': showRoads,
      'path': showRoads,
      'track': showRoads,
      'pedestrian': showRoads,
      'footway': showRoads,
      'cycleway': showRoads,
      'railway': showRail,
      'rail': showRail,
      'aeroway': showAeroway,
      'label': showLabels,
      'text': showLabels,
      'symbol': showLabels,
      'place': showLabels,
    };

    layers.forEach((l: any) => {
      Object.entries(layerVisibility).forEach(([pattern, visible]) => {
        if (l.id.includes(pattern) || l.type === 'symbol') {
          try {
            // Apply visibility to standard layers containing the pattern
            // or any layer of type 'symbol' (which covers most text/icons)
            const isMatch = l.id.includes(pattern) || (pattern === 'symbol' && l.type === 'symbol');
            if (isMatch) {
              map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
            }
          } catch (e) {}
        }
      });
    });
  }, [showLandcover, showBuildings, showWater, showParks, showRoads, showRail, showAeroway, showLabels, mapRef, currentColors]);

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setMapCenter([longitude, latitude]);
        setZoom(13);
        
        if (mapRef.current) {
          (mapRef.current as any).flyTo({ center: [longitude, latitude], zoom: 13, duration: 1500 });
        }
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (data && data.address) {
            const place = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || 'LOCALITY';
            const country = data.address.country || 'COUNTRY';
            setLocName(place.toUpperCase());
            setLocCountry(country.toUpperCase());
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
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        const lon = parseFloat(result.lon);
        const lat = parseFloat(result.lat);
        
        setMapCenter([lon, lat]);
        setZoom(13);

        if (mapRef.current) {
          mapRef.current.flyTo({ center: [lon, lat], zoom: 13, duration: 2000 });
        }

        // Try to get structured address for poster
        const detailRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const detailData = await detailRes.json();
        
        if (detailData && detailData.address) {
          const place = detailData.address.city || detailData.address.town || detailData.address.village || detailData.address.suburb || detailData.address.county || detailData.display_name.split(',')[0];
          const country = detailData.address.country || 'COUNTRY';
          setLocName(place.toUpperCase());
          setLocCountry(country.toUpperCase());
        }
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

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
  ];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      <style jsx global>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
      `}</style>
      <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 z-50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-primary rounded-tr-xl rounded-bl-xl rounded-br-sm rounded-tl-sm rotate-45 flex items-center justify-center">
            <div className="w-3 h-3 bg-background rounded-full"></div>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold tracking-widest text-foreground font-sans">
              CARTOGRAPHIC STUDIO
            </h1>
            <span className="text-[10px] text-muted-foreground tracking-[0.2em] font-medium">
              FREE MAP POSTER & WALLPAPER CREATOR
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 space-x-1">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs font-medium border border-border/50 text-foreground transition-colors">
            <Github className="w-4 h-4" />
            2,723 ★
          </button>
          <button className="p-2 bg-secondary/50 hover:bg-secondary rounded border border-border/50 text-foreground transition-colors">
            <Instagram className="w-4 h-4" />
          </button>
          <button className="p-2 bg-secondary/50 hover:bg-secondary rounded border border-border/50 text-foreground transition-colors">
            <Coffee className="w-4 h-4" />
          </button>
          <button className="px-4 py-1.5 bg-secondary/50 hover:bg-secondary rounded text-xs font-bold tracking-widest border border-border/50 text-foreground transition-colors">
            ABOUT
          </button>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden bg-[#050810]">
        
        <aside className="w-[88px] h-full bg-background border-r border-border flex flex-col items-center py-6 z-40 shrink-0">
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
                  }}
                  className={`flex flex-col items-center gap-1.5 w-full relative transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
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

        <aside 
          className={`absolute left-[88px] top-0 bottom-0 w-[400px] bg-[#0a0f18] border-r border-white/5 z-30 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            activeTab ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0 pointer-events-none'
          }`}
        >
          <div className="p-6 pb-4 border-b border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <form 
                onSubmit={handleSearch}
                className="flex items-center bg-white/5 border border-white/10 rounded-lg pl-3 pr-2 py-2 w-full shadow-inner transition-all focus-within:border-primary/50 focus-within:bg-white/10 grow"
              >
                {searchLoading ? (
                  <RefreshCw className="w-4 h-4 text-primary animate-spin mr-3" />
                ) : (
                  <Search className="w-4 h-4 text-muted-foreground mr-3" />
                )}
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
                onClick={handleGeolocation} 
                className={`shrink-0 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg shadow-lg text-white transition-colors ${searchLoading ? 'opacity-50 pointer-events-none' : ''}`} 
                title="My Location"
              >
                <Crosshair className="w-4 h-4" />
              </button>
              <button className="shrink-0 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg shadow-lg text-white transition-colors" title="Add Marker">
                <MapPin className="w-4 h-4" />
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
                          onClick={() => setIsEditorOpen(true)}
                          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
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
                          className={`w-full group text-left rounded-xl border transition-all overflow-hidden ${
                            selectedThemeId === theme.id 
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
                      <div className="grid grid-cols-4 gap-y-6 gap-x-4">
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
                    <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors border border-white/10">
                      <Brush className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-4">
                    Default print ratio based on {selectedLayout.name.toLowerCase()}.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
                  {['PRINT', 'SOCIAL MEDIA', 'DIGITAL'].map((cat) => (
                    <div key={cat} className="space-y-4">
                      <h3 className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">{cat}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {layouts.filter(l => l.category === cat).map((layout) => (
                          <button
                            key={layout.id}
                            onClick={() => setSelectedLayoutId(layout.id)}
                            className={`flex flex-col text-left rounded-xl border p-3 transition-all ${
                              selectedLayoutId === layout.id 
                                ? 'border-primary/50 bg-primary/5 shadow-lg' 
                                : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'
                            }`}
                          >
                            <span className="text-[9px] font-bold text-white mb-0.5 uppercase tracking-tighter truncate w-full">
                              {layout.name}
                            </span>
                            <span className="text-[8px] text-muted-foreground mb-3 font-mono">
                              {layout.dims}
                            </span>
                            
                            <div className="mt-auto flex items-center justify-center h-20 w-full bg-[#1a1f2b] rounded-lg border border-white/5 overflow-hidden">
                               <div 
                                  className={`bg-primary/30 border border-primary/20 rounded-sm shadow-sm transition-all duration-300 ${
                                    layout.aspect > 1 ? 'w-[70%] h-[40%]' : 'w-[40%] h-[70%]'
                                  }`} 
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
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                        showPosterText ? 'bg-primary' : 'bg-white/10'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        showPosterText ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Toggle: Overlay Layer */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Overlay layer</span>
                    <button 
                      onClick={() => setShowOverlay(!showOverlay)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                        showOverlay ? 'bg-primary' : 'bg-white/10'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                        showOverlay ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Editable City & Country */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Display city</label>
                      <input 
                        type="text" 
                        value={locName}
                        onChange={(e) => setLocName(e.target.value.toUpperCase())}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-muted-foreground focus:border-primary/50 focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Display country</label>
                      <input 
                        type="text" 
                        value={locCountry}
                        onChange={(e) => setLocCountry(e.target.value.toUpperCase())}
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

                  {/* Font Preview */}
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Preview</p>
                    <p className="text-2xl font-bold tracking-[0.15em] text-white" style={{ fontFamily: selectedFont }}>
                      {locName || 'CITY NAME'}
                    </p>
                    <p className="text-sm tracking-[0.3em] text-muted-foreground mt-1" style={{ fontFamily: selectedFont }}>
                      {locCountry || 'COUNTRY'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'layers' && (
              <div className="flex flex-col h-full bg-[#0c111c]">
                <div className="p-6 pb-4 border-b border-white/5">
                  <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase mb-1">LAYERS</h2>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
                  {/* Layer visibility toggles */}
                  {[
                    { label: 'Show landcover', state: showLandcover, setter: setShowLandcover },
                    { label: 'Show buildings', state: showBuildings, setter: setShowBuildings },
                    { label: 'Show water', state: showWater, setter: setShowWater },
                    { label: 'Show parks', state: showParks, setter: setShowParks },
                    { label: 'Show roads', state: showRoads, setter: setShowRoads },
                    { label: 'Show rail', state: showRail, setter: setShowRail },
                    { label: 'Show aeroway', state: showAeroway, setter: setShowAeroway },
                    { label: 'Show labels', state: showLabels, setter: setShowLabels },
                  ].map(({ label, state, setter }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{label}</span>
                      <button 
                        onClick={() => setter(!state)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                          state ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                          state ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  ))}

                  {/* Divider */}
                  <div className="border-t border-white/5 pt-6">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase mb-6">MAP DETAILS</h3>

                    {/* Distance Control */}
                    <div className="mb-8">
                       <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold text-white">Distance (m)</span>
                          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 min-w-[120px] flex justify-end shadow-inner">
                             <input 
                                type="text"
                                value={distance}
                                onChange={(e) => {
                                   const val = parseInt(e.target.value.replace(/\D/g, ''));
                                   if (!isNaN(val)) setDistance(val);
                                }}
                                className="bg-transparent text-right text-white font-bold text-base outline-none w-full"
                             />
                          </div>
                       </div>
                       
                       <div className="relative pt-1 pb-6 px-1">
                          <input 
                             type="range"
                             min="4.6" // ln(100)
                             max="16.8" // ln(20M)
                             step="0.01"
                             value={Math.log(distance)}
                             onChange={(e) => setDistance(Math.round(Math.exp(parseFloat(e.target.value))))}
                             className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                             style={{
                                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((Math.log(distance) - 4.6) / (16.8 - 4.6)) * 100}%, rgba(255,255,255,0.1) ${((Math.log(distance) - 4.6) / (16.8 - 4.6)) * 100}%, rgba(255,255,255,0.1) 100%)`
                             }}
                          />
                          <div className="absolute left-0 right-0 top-6 flex justify-between px-0.5">
                             <span className="text-[10px] font-bold text-muted-foreground">100 m</span>
                             <span className="text-[10px] font-bold text-muted-foreground">100K m</span>
                             <span className="text-[10px] font-bold text-muted-foreground">1M m</span>
                             <span className="text-[10px] font-bold text-muted-foreground">20M m</span>
                          </div>
                       </div>
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
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                          isMapLocked ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                          isMapLocked ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Allow Rotation</span>
                      <button 
                        onClick={() => setIsRotationEnabled(!isRotationEnabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                          isRotationEnabled ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                          isRotationEnabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">POSTER DECORATIONS</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Show Text</span>
                      <button 
                        onClick={() => setShowPosterText(!showPosterText)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                          showPosterText ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                          showPosterText ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Background Overlay</span>
                      <button 
                        onClick={() => setShowOverlay(!showOverlay)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                          showOverlay ? 'bg-primary' : 'bg-white/10'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                          showOverlay ? 'translate-x-6' : 'translate-x-0.5'
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
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 relative w-full h-full flex flex-col items-center justify-center p-6">
          <div className="absolute top-6 right-6 z-30 bg-background/90 backdrop-blur-md border border-border rounded-lg p-5 w-64 shadow-xl">
            <h3 className="text-xs font-bold tracking-[0.2em] mb-4 text-foreground">CURRENT SETTINGS</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
              <div>
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">LOCATION</p>
                <p className="text-foreground truncate font-medium">{locName}, {locCountry.charAt(0) + locCountry.slice(1).toLowerCase()}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">THEME</p>
                <p className="text-foreground font-medium">{selectedTheme.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">LAYOUT</p>
                <p className="text-foreground font-medium truncate uppercase">{selectedLayout.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">ASPECT RATIO</p>
                <p className="text-foreground font-medium">
                  {selectedLayout.aspect < 1 
                    ? `1:${(1/selectedLayout.aspect).toFixed(2)}` 
                    : `${selectedLayout.aspect.toFixed(2)}:1`}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">MARKERS</p>
                <p className="text-foreground font-medium">0 markers</p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">COORDINATES</p>
                <p className="text-foreground font-medium">{mapCenter[1].toFixed(4)}, {mapCenter[0].toFixed(4)}</p>
              </div>
            </div>
          </div>

          <div className="z-20 flex flex-col items-center gap-6 pb-12 w-full max-w-full overflow-hidden px-4">
            <div 
               className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border overflow-hidden rounded-sm ring-1 ring-white/10 flex flex-col pointer-events-auto shrink transition-all duration-500 mx-auto"
               style={{ 
                  backgroundColor: currentColors['Land'], 
                  borderColor: currentColors['Road Outline'],
                  aspectRatio: selectedLayout.aspect,
                  maxHeight: '70vh',
                  maxWidth: '100%',
                  height: selectedLayout.aspect > 1.2 ? 'auto' : '70vh',
                  width: selectedLayout.aspect > 1.2 ? '100%' : 'auto'
               }}
            >
              <div className="absolute inset-0" style={{ backgroundColor: currentColors['Land'] }}>
                <Map
                  ref={mapRef}
                  theme="dark"
                  center={mapCenter}
                  zoom={zoom}
                  className="w-full h-full opacity-80"
                />
              </div>

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
                <div className="absolute bottom-12 left-0 w-full flex flex-col items-center justify-center z-20 pointer-events-none">
                  <h2 
                    className="text-3xl sm:text-4xl leading-none font-bold tracking-[0.25em] mb-4 text-center mx-4"
                    style={{ color: currentColors['Text'], fontFamily: selectedFont }}
                  >
                    {locName}
                  </h2>
                  
                  <div 
                    className="w-48 h-px mb-3 block" 
                    style={{ backgroundColor: `${currentColors['Text']}80` }}
                  />
                  
                  <p 
                    className="text-lg font-medium tracking-[0.4em] mb-3"
                    style={{ color: currentColors['Text'], fontFamily: selectedFont }}
                  >
                    {locCountry}
                  </p>
                  
                  <p 
                    className="text-[10px] tracking-[0.2em] font-mono"
                    style={{ color: `${currentColors['Text']}b3` }}
                  >
                    {Math.abs(mapCenter[1]).toFixed(4)}° {mapCenter[1] >= 0 ? 'N' : 'S'} / {Math.abs(mapCenter[0]).toFixed(4)}° {mapCenter[0] >= 0 ? 'E' : 'W'}
                  </p>
                </div>
              )}
            </div>

            {!isMapLocked && (
              <div className="flex items-center gap-4 px-4 py-2 bg-background/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                <button 
                  onClick={() => setIsMapLocked(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-bold transition-all transition-colors uppercase"
                >
                  <LockIcon className="w-3.5 h-3.5" />
                  Lock Map
                </button>

                <div className="w-px h-6 bg-white/10" />

                <button 
                  onClick={() => setIsRotationEnabled(!isRotationEnabled)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase ${
                    isRotationEnabled 
                      ? 'bg-primary text-black' 
                      : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRotationEnabled ? 'animate-spin-slow' : ''}`} />
                  {isRotationEnabled ? 'Disable Rotation' : 'Enable Rotation'}
                </button>

                <div className="w-px h-6 bg-white/10" />

                <div className="flex items-center gap-3 px-2">
                  <button 
                    onClick={() => mapRef.current?.zoomTo(zoom - 0.5)}
                    className="p-1.5 hover:bg-white/10 rounded-md text-white transition-colors"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  
                  <input 
                    type="range" 
                    min="1" 
                    max="20" 
                    step="0.1"
                    value={zoom}
                    onChange={(e) => {
                      const newZoom = parseFloat(e.target.value);
                      setZoom(newZoom);
                      mapRef.current?.setZoom(newZoom);
                    }}
                    className="w-32 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                  />

                  <button 
                    onClick={() => mapRef.current?.zoomTo(zoom + 0.5)}
                    className="p-1.5 hover:bg-white/10 rounded-md text-white transition-colors"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions under the Poster */}
            <div className="flex items-center gap-4 shrink-0 transition-opacity">
               <button onClick={handleRecenter} className="flex items-center gap-2 px-6 py-3 bg-background/90 backdrop-blur-md hover:bg-secondary hover:text-primary rounded-full border border-border font-medium text-sm text-foreground shadow-xl transition-colors w-40 justify-center">
                  <Crosshair className="w-4 h-4" />
                  Recenter
               </button>
               <button 
                  onClick={() => setIsMapLocked(!isMapLocked)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full border font-medium text-sm shadow-xl transition-all w-40 justify-center ${
                    isMapLocked 
                      ? 'bg-primary text-black border-transparent hover:opacity-90' 
                      : 'bg-background/90 text-foreground border-border hover:bg-secondary hover:text-primary'
                  }`}
               >
                  {isMapLocked ? <Brush className="w-4 h-4" /> : <LockIcon className="w-4 h-4" />}
                  {isMapLocked ? 'Edit Map' : 'Lock Map'}
               </button>
            </div>
          </div>

          {/* Floating Bottom Right Action */}
          <div className="absolute bottom-8 right-8 z-30">
            <button className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-100 rounded text-black font-bold tracking-wider text-sm shadow-xl transition-all hover:scale-105 active:scale-95">
              <Download className="w-4 h-4" />
              DOWNLOAD
            </button>
          </div>

          {/* Footer removed per user request */}
        </main>
      </div>
    </div>
  );
};

export default MapPoster;
