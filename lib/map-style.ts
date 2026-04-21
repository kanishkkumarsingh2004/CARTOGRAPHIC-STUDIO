import type { StyleSpecification } from "maplibre-gl";

// TerraInk's exact map style generator — ported from
// src/features/map/infrastructure/maplibreStyle.ts

const OPENFREEMAP_SOURCE = "https://tiles.openfreemap.org/planet";
const SOURCE_ID = "openfreemap";
const SOURCE_MAX_ZOOM = 14;

const OVERZOOM_SCALE = 5.5;
// Stroke widths are boosted to compensate for the viewport scale-down
const OVERZOOM_LINE_WIDTH_SCALE = Math.pow(OVERZOOM_SCALE, 0.8);

// Road class buckets (OpenMapTiles "class" property)
const ROAD_MAJOR = ["motorway"];
const ROAD_MINOR_HIGH = ["primary","primary_link","secondary","secondary_link","motorway_link","trunk","trunk_link"];
const ROAD_MINOR_MID = ["tertiary","tertiary_link","minor"];
const ROAD_MINOR_LOW = ["residential","living_street","unclassified","road","street","street_limited","service"];
const ROAD_PATH = ["path","pedestrian","cycleway","track"];
const RAIL_CLASSES = ["rail","transit"];

// Width stop tables [zoom, px]
const WATERWAY_W: [number,number][] = [[0,0.2],[6,0.34],[12,0.8],[18,2.4]];
const RAIL_W: [number,number][] = [[3,0.4],[6,0.7],[10,1],[18,1.5]];
const ROAD_MAJOR_W: [number,number][] = [[0,0.36],[3,0.52],[9,1.1],[14,2.05],[18,3.3]];
const ROAD_MINOR_HIGH_OV_W: [number,number][] = [[0,0.1],[4,0.18],[8,0.3],[11,0.46]];
const ROAD_MINOR_MID_OV_W: [number,number][] = [[0,0.08],[4,0.14],[8,0.24],[11,0.36]];
const ROAD_MINOR_LOW_OV_W: [number,number][] = [[0,0.06],[4,0.1],[8,0.18],[11,0.3]];
const ROAD_PATH_OV_W: [number,number][] = [[5,0.06],[8,0.1],[11,0.2]];
const ROAD_MINOR_HIGH_DT_W: [number,number][] = [[6,0.46],[10,0.8],[14,1.48],[18,2.7]];
const ROAD_MINOR_MID_DT_W: [number,number][] = [[6,0.34],[10,0.62],[14,1.2],[18,2.35]];
const ROAD_MINOR_LOW_DT_W: [number,number][] = [[6,0.24],[10,0.44],[14,0.84],[18,1.65]];
const ROAD_PATH_DT_W: [number,number][] = [[8,0.2],[12,0.42],[16,0.85],[18,1.3]];

const LINE_FILTER = ["match",["geometry-type"],["LineString","MultiLineString"],true,false] as const;

function w(stops: [number,number][]): any {
  return ["interpolate",["linear"],["zoom"],...stops.flatMap(([z,v])=>[z,v])];
}
function op(stops: [number,number][]): any {
  return ["interpolate",["linear"],["zoom"],...stops.flatMap(([z,v])=>[z,v])];
}
function scale(stops: [number,number][], s: number): [number,number][] {
  return stops.map(([z,v])=>[z,v*s]);
}
function ow(stops: [number,number][]): any {
  return w(scale(stops, OVERZOOM_LINE_WIDTH_SCALE));
}
function classFilter(classes: string[]): any {
  return ["all", LINE_FILTER, ["match",["get","class"],classes,true,false]];
}
function vis(show: boolean): "visible"|"none" { return show ? "visible" : "none"; }

export interface MapStyleColors {
  land: string;
  landcover: string;
  water: string;
  waterway: string;
  parks: string;
  aeroway: string;
  buildings: string;
  rail: string;
  roadMajor: string;
  roadMinorHigh: string;
  roadMinorMid: string;
  roadMinorLow: string;
  roadPath: string;
  roadOutline: string;
}

export interface MapStyleOptions {
  colors: MapStyleColors;
  showLandcover?: boolean;
  showBuildings?: boolean;
  showWater?: boolean;
  showParks?: boolean;
  showAeroway?: boolean;
  showRail?: boolean;
  showRoads?: boolean;
}

export function generateMapStyle(opts: MapStyleOptions): StyleSpecification {
  const c = opts.colors;
  const sLandcover = opts.showLandcover ?? true;
  const sBuildings = opts.showBuildings ?? false;
  const sWater = opts.showWater ?? true;
  const sParks = opts.showParks ?? true;
  const sAeroway = opts.showAeroway ?? true;
  const sRail = opts.showRail ?? true;
  const sRoads = opts.showRoads ?? true;

  const majorCasingW = scale(ROAD_MAJOR_W, 1.38);
  const minorHighCasingW = scale(ROAD_MINOR_HIGH_DT_W, 1.45);
  const minorMidCasingW = scale(ROAD_MINOR_MID_DT_W, 1.15);
  const pathCasingW = scale(ROAD_PATH_DT_W, 1.6);

  return {
    version: 8,
    sources: {
      [SOURCE_ID]: {
        type: "vector",
        url: OPENFREEMAP_SOURCE,
        maxzoom: SOURCE_MAX_ZOOM,
      },
    },
    layers: [
      { id:"background", type:"background", paint:{"background-color":c.land} },

      // Landcover
      { id:"landcover", source:SOURCE_ID, "source-layer":"landcover", type:"fill",
        layout:{visibility:vis(sLandcover)},
        paint:{"fill-color":c.landcover,"fill-opacity":0.7} },

      // Parks
      { id:"park", source:SOURCE_ID, "source-layer":"park", type:"fill",
        layout:{visibility:vis(sParks)},
        paint:{"fill-color":c.parks} },

      // Water
      { id:"water", source:SOURCE_ID, "source-layer":"water", type:"fill",
        layout:{visibility:vis(sWater)},
        paint:{"fill-color":c.water} },
      { id:"waterway", source:SOURCE_ID, "source-layer":"waterway", type:"line",
        filter:classFilter(["river","canal","stream","ditch"]),
        layout:{visibility:vis(sWater),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.waterway,"line-width":ow(WATERWAY_W)} },

      // Aeroway
      { id:"aeroway", source:SOURCE_ID, "source-layer":"aeroway", type:"fill",
        filter:["match",["geometry-type"],["MultiPolygon","Polygon"],true,false],
        layout:{visibility:vis(sAeroway)},
        paint:{"fill-color":c.aeroway,"fill-opacity":0.85} },

      // Buildings
      { id:"building", source:SOURCE_ID, "source-layer":"building", type:"fill",
        minzoom:8,
        layout:{visibility:vis(sBuildings)},
        paint:{"fill-color":c.buildings,"fill-opacity":0.84} },

      // Rail
      { id:"rail", source:SOURCE_ID, "source-layer":"transportation", type:"line",
        filter:classFilter(RAIL_CLASSES),
        layout:{visibility:vis(sRail),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.rail,"line-width":ow(RAIL_W),
          "line-opacity":op([[0,0.56],[12,0.62],[18,0.72]]),"line-dasharray":[2,1.6]} },

      // Roads — overview layers (thin, low zoom, fade out at zoom 12)
      { id:"road-minor-overview-high", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:0, maxzoom:11.8, filter:classFilter(ROAD_MINOR_HIGH),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMinorHigh,"line-width":ow(ROAD_MINOR_HIGH_OV_W),
          "line-opacity":op([[0,0.66],[8,0.76],[12,0]])} },
      { id:"road-minor-overview-mid", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:0, maxzoom:11.8, filter:classFilter(ROAD_MINOR_MID),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMinorMid,"line-width":ow(ROAD_MINOR_MID_OV_W),
          "line-opacity":op([[0,0.46],[8,0.56],[12,0]])} },
      { id:"road-minor-overview-low", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:0, maxzoom:11.8, filter:classFilter(ROAD_MINOR_LOW),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMinorLow,"line-width":ow(ROAD_MINOR_LOW_OV_W),
          "line-opacity":op([[0,0.26],[8,0.34],[12,0]])} },
      { id:"road-path-overview", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:5, maxzoom:11.8, filter:classFilter(ROAD_PATH),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadPath,"line-width":ow(ROAD_PATH_OV_W),
          "line-opacity":op([[5,0.45],[9,0.58],[12,0]])} },

      // Roads — casing layers
      { id:"road-major-casing", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", filter:classFilter(ROAD_MAJOR),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadOutline,"line-width":ow(majorCasingW),"line-opacity":0.95} },
      { id:"road-minor-high-casing", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:6, filter:classFilter(ROAD_MINOR_HIGH),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadOutline,"line-width":ow(minorHighCasingW),
          "line-opacity":op([[6,0.72],[12,0.85],[18,0.92]])} },
      { id:"road-minor-mid-casing", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:6, filter:classFilter(ROAD_MINOR_MID),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadOutline,"line-width":ow(minorMidCasingW),
          "line-opacity":op([[6,0.42],[12,0.56],[18,0.66]])} },
      { id:"road-path-casing", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:8, filter:classFilter(ROAD_PATH),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadOutline,"line-width":ow(pathCasingW),
          "line-opacity":op([[8,0.62],[12,0.72],[18,0.85]])} },

      // Roads — fill layers
      { id:"road-major", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", filter:classFilter(ROAD_MAJOR),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMajor,"line-width":ow(ROAD_MAJOR_W)} },
      { id:"road-minor-high", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:6, filter:classFilter(ROAD_MINOR_HIGH),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMinorHigh,"line-width":ow(ROAD_MINOR_HIGH_DT_W),
          "line-opacity":op([[6,0.84],[10,0.92],[18,1]])} },
      { id:"road-minor-mid", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:6, filter:classFilter(ROAD_MINOR_MID),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMinorMid,"line-width":ow(ROAD_MINOR_MID_DT_W),
          "line-opacity":op([[6,0.62],[10,0.74],[18,0.86]])} },
      { id:"road-minor-low", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:6, filter:classFilter(ROAD_MINOR_LOW),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadMinorLow,"line-width":ow(ROAD_MINOR_LOW_DT_W),
          "line-opacity":op([[6,0.34],[10,0.46],[18,0.58]])} },
      { id:"road-path", source:SOURCE_ID, "source-layer":"transportation",
        type:"line", minzoom:8, filter:classFilter(ROAD_PATH),
        layout:{visibility:vis(sRoads),"line-cap":"round","line-join":"round"},
        paint:{"line-color":c.roadPath,"line-width":ow(ROAD_PATH_DT_W),
          "line-opacity":op([[8,0.7],[12,0.82],[18,0.95]])} },
    ],
  } as StyleSpecification;
}
