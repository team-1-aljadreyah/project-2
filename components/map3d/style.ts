// The map's look, after the "3D map of Boston for Fasten" design Yasser chose: a clay city. Plain white
// buildings standing up in 3D, light grey streets, soft light from one side, no clutter of labels,
// and routes drawn as thin glowing green lines. A dark version (graphite clay) follows night mode.
// The data is OpenStreetMap, from OpenFreeMap's free vector tiles (no API key).
import type { StyleSpecification } from "maplibre-gl";

export const TILES = "https://tiles.openfreemap.org/planet";

export type MapTheme = "light" | "dark";

const C = {
  light: {
    bg: "#eceef1",
    park: "#e3e8e2",
    water: "#dbe2ea",
    road: "#ffffff",
    roadEdge: "#dde1e6",
    minor: "#f6f7f9",
    building: "#ffffff",
    rail: "#d7dbe0",
  },
  dark: {
    bg: "#14171b",
    park: "#171d19",
    water: "#0f141a",
    road: "#262b33",
    roadEdge: "#1b1f25",
    minor: "#1f242b",
    building: "#2b3038",
    rail: "#22262d",
  },
};

/** The route glow (as in the design) and the brand orange for pins. */
export const ROUTE = { glow: "#5cf06f", core: "#35d64e", done: "#9aa3ad" };

const ZOOMS: [number, number][] = [
  [10, 0.3],
  [14, 1.4],
  [17, 5],
  [19, 12],
];
/** A road width that grows with the zoom. MapLibre wants the zoom curve on the outside of the rule. */
const width = (base: number) => ["interpolate", ["exponential", 1.6], ["zoom"], ...ZOOMS.flatMap(([z, f]) => [z, base * f])] as unknown as number;
/** The same, by road type: big roads wider. */
const widthBy = (big: number, mid: number, small: number) =>
  [
    "interpolate",
    ["exponential", 1.6],
    ["zoom"],
    ...ZOOMS.flatMap(([z, f]) => [z, ["match", ["get", "class"], ["motorway", "trunk"], big * f, ["primary", "secondary"], mid * f, small * f]]),
  ] as unknown as number;

export function mapStyle(theme: MapTheme): StyleSpecification {
  const c = C[theme];
  return {
    version: 8,
    sources: { omt: { type: "vector", url: TILES } },
    // Soft light from the upper side, so the sides of the buildings are a little darker than the roofs.
    light: {
      anchor: "viewport",
      color: "#ffffff",
      intensity: theme === "light" ? 0.32 : 0.22,
      position: [1.4, 210, 35],
    },
    sky: {
      "sky-color": c.bg,
      "horizon-color": c.bg,
      "fog-color": c.bg,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
      "fog-ground-blend": 0.25,
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": c.bg } },
      {
        id: "park",
        type: "fill",
        source: "omt",
        "source-layer": "park",
        paint: { "fill-color": c.park },
      },
      {
        id: "green",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wood", "farmland"]]],
        paint: { "fill-color": c.park, "fill-opacity": 0.7 },
      },
      {
        id: "water",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        paint: { "fill-color": c.water },
      },
      {
        id: "rail",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": c.rail, "line-width": 1 },
      },
      // Streets: a soft edge under a white band; the main roads are wider.
      {
        id: "road-edge",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.roadEdge,
          "line-width": widthBy(3.4, 2.6, 1.9),
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track", "path"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.minor, "line-width": width(0.9) },
      },
      {
        id: "road",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.road,
          "line-width": widthBy(2.8, 2.1, 1.5),
        },
      },
      // The clay buildings: all the same plain color; height from OpenStreetMap (or a low default).
      {
        id: "buildings",
        type: "fill-extrusion",
        source: "omt",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": c.building,
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, ["*", ["coalesce", ["get", "render_height"], 7], 1.2]],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.96,
          "fill-extrusion-vertical-gradient": true,
        },
      },
    ],
  };
}
