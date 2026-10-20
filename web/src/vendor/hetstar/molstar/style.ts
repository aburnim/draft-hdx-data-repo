// Copied from rtviii/hetstar @ fc08cdb, packages/hetstar/src/lib/molstar/style.ts.
// Trimmed: the qFit/deposited model colors are dropped; the color theme union names this
// repo's custom per-residue theme ("hdx-value") instead of "alt-loc".

import type { ColorTheme } from "molstar/lib/mol-theme/color";
import { Color } from "molstar/lib/mol-util/color";

// Illustrative look: a black outline + ambient occlusion, no shadows. Paired with a white canvas and a flat
// (ignoreLight) material on every representation, this gives the stylized, unlit look the
// cartoon/ball-and-stick reads with instead of Mol*'s default shiny lit material.
export const STYLIZED_POSTPROCESSING = {
  outline: {
    name: "on" as const,
    params: { scale: 0.5, color: Color(0x000000), threshold: 0.33, includeTransparent: true },
  },
  occlusion: {
    name: "on" as const,
    params: {
      multiScale: { name: "off" as const, params: {} },
      radius: 5,
      bias: 0.8,
      blurKernelSize: 15,
      blurDepthBias: 0.5,
      samples: 32,
      resolutionScale: 1,
      color: Color(0x000000),
    },
  },
  shadow: { name: "off" as const, params: {} },
};

export const WHITE_BACKGROUND = Color(0xffffff);

// Components to render as ball-and-stick by default (everything except water/coarse, so the
// view isn't dominated by scattered solvent oxygens).
export const BALL_AND_STICK_COMPONENTS = ["polymer", "ligand", "ion", "branched", "lipid"] as const;

// Polymer-only component list for trace-based representations (cartoon / putty) that have no
// meaning on isolated ligands or ions.
export const POLYMER_COMPONENTS = ["polymer"] as const;

export type ExampleRepresentation = "ball-and-stick" | "ellipsoid" | "putty" | "cartoon" | "spacefill";

export interface StructureView {
  representation: ExampleRepresentation;
  colorTheme: ColorTheme.BuiltIn | "hdx-value"; // "hdx-value" is registered at viewer init
  /** only read when colorTheme is "uniform" */
  uniformColor?: number;
}

export const DEFAULT_VIEW: StructureView = { representation: "ball-and-stick", colorTheme: "element-symbol" };

// Representations that only render on the polymer trace; for these we skip ligand/ion/etc.
export const POLYMER_ONLY_REPRESENTATIONS: ReadonlyArray<ExampleRepresentation> = ["cartoon", "putty"];
