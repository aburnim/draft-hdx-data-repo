// Copied from rtviii/hetstar @ fc08cdb, packages/hetstar/src/lib/molstar/viewer.ts.
// Trimmed: secondary-structure loading, density pickability and the off-tree frame reader
// are dropped. Changed: registers this repo's per-residue theme instead of the alt-loc
// one, and adds recolor() so a slider can repaint without rebuilding the scene.

import { Bond, type Structure, StructureElement, StructureProperties } from "molstar/lib/mol-model/structure";
import { createPluginUI } from "molstar/lib/mol-plugin-ui";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import { Color } from "molstar/lib/mol-util/color";
import { MarkerAction } from "molstar/lib/mol-util/marker-action";
import type { ColorTheme } from "molstar/lib/mol-theme/color";
import { HdxValueColorThemeProvider } from "../../../hdx/value-theme";
import { labViewerSpec } from "./spec";
import {
  BALL_AND_STICK_COMPONENTS,
  DEFAULT_VIEW,
  POLYMER_COMPONENTS,
  POLYMER_ONLY_REPRESENTATIONS,
  type StructureView,
  STYLIZED_POSTPROCESSING,
  WHITE_BACKGROUND,
} from "./style";

// Structures are built from the model as deposited (the asymmetric unit). Left to its
// default, Mol* builds biological assembly 1 whenever the file carries assemblies (every
// RCSB CIF), which can drop chains or add symmetry copies that the lanes know nothing about.
const AS_MODELED = { name: "model" as const, params: {} };

const NO_HYDROGENS = { ignoreHydrogens: true } as const;

export interface PickInfo {
  chainId: string;
  authSeqId: number;
  compId: string;
  /** label_atom_id of the picked atom */
  atomId: string;
  /** alternate-location letter of the picked atom; "" for shared atoms */
  altId: string;
  /** insertion code, "" when absent */
  insCode: string;
}

/**
 * Pure Mol* wrapper: owns the plugin lifecycle and exposes low-level operations
 * (load / highlight / focus / select / subscribe). No React, no app state. Runs the
 * chrome-free lab spec (lib/molstar/spec.ts): clicks belong to the app.
 */
export class MolstarViewer {
  ctx: PluginUIContext | null = null;
  private initPromise: Promise<void> | null = null;
  // Frame scrubbing: the state ref of the model-from-trajectory transform (whose modelIndex param we
  // update to switch frames) and the trajectory's total frame count.
  private modelRef: string | null = null;
  private modelCount = 1;
  private colorVersion = 0;

  async init(container: HTMLElement): Promise<void> {
    if (this.ctx) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit(container);
    return this.initPromise;
  }

  private async doInit(container: HTMLElement): Promise<void> {
    this.ctx = await createPluginUI({ target: container, spec: labViewerSpec, render: renderReact18 });
    const registry = this.ctx.representation.structure.themes.colorThemeRegistry;
    if (!registry.has(HdxValueColorThemeProvider)) registry.add(HdxValueColorThemeProvider);
    this.applyDefaultStyling();
    this.ctx.canvas3d?.setProps({
      pickScale: 0.5,
      renderer: { pickingAlphaThreshold: 0.1, highlightColor: Color(0x93b3d1), dimStrength: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  private applyDefaultStyling(): void {
    if (!this.ctx) return;
    // Illustrative look: white canvas + outline + ambient occlusion,
    // and a flat (unlit) material on every representation.
    this.ctx.canvas3d?.setProps({
      postprocessing: STYLIZED_POSTPROCESSING,
      renderer: { backgroundColor: WHITE_BACKGROUND },
      // Never let an implicit scene change (e.g. adding a representation) auto-refit the camera.
      camera: { manualReset: true },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    this.ctx.managers.structure.component.setOptions({
      ...this.ctx.managers.structure.component.state.options,
      ignoreLight: true,
    });
  }

  handleResize(): void {
    this.ctx?.canvas3d?.handleResize();
  }

  // --- data loading (parses + applies the requested representation) ---

  async load(data: string | Uint8Array, opts: { label?: string; view?: StructureView } = {}): Promise<void> {
    if (!this.ctx) throw new Error("Viewer not initialized");
    const raw = await this.ctx.builders.data.rawData({
      data: data as string | Uint8Array<ArrayBuffer>,
      label: opts.label,
    });
    if (!this.ctx) throw new Error("Viewer disposed during load");
    const trajectory = await this.ctx.builders.structure.parseTrajectory(raw, "mmcif");
    if (!this.ctx) throw new Error("Viewer disposed during load");
    await this.buildRepresentation(trajectory, opts.view ?? DEFAULT_VIEW);
  }

  // Build the structure from the trajectory's first model and render it with the requested
  // representation + colour theme. Trace-based representations (cartoon / putty) are
  // restricted to the polymer; everything else covers all non-solvent components.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async buildRepresentation(trajectory: any, view: StructureView): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    this.modelCount = trajectory?.data?.frameCount ?? 1;
    const model = await ctx.builders.structure.createModel(trajectory);
    if (!this.ctx) return;
    this.modelRef = model.ref;
    const structure = await ctx.builders.structure.createStructure(model, AS_MODELED);
    if (!this.ctx) return;
    const components = POLYMER_ONLY_REPRESENTATIONS.includes(view.representation)
      ? POLYMER_COMPONENTS
      : BALL_AND_STICK_COMPONENTS;
    for (const kind of components) {
      const comp = await ctx.builders.structure.tryCreateComponentStatic(structure, kind);
      if (!comp || !this.ctx) continue;
      await ctx.builders.structure.representation.addRepresentation(comp, {
        type: view.representation,
        typeParams: { ignoreLight: true, ...NO_HYDROGENS },
        color: view.colorTheme as ColorTheme.BuiltIn,
        ...(view.colorTheme === "uniform" ? { colorParams: { value: Color(view.uniformColor ?? 0xcfd8dc) } } : {}),
      });
    }
  }

  /**
   * Repaint every representation with the per-residue theme. The theme reads its colors
   * from a shared table (hdx/value-theme.ts); bumping `version` is what makes Mol* rebuild
   * the theme, since the table itself is not a theme parameter.
   */
  async recolor(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const components = ctx.managers.structure.hierarchy.current.structures.flatMap((s) => s.components);
    if (!components.length) return;
    this.colorVersion++;
    await ctx.managers.structure.component.updateRepresentationsTheme(components, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      color: "hdx-value" as any,
      colorParams: { version: this.colorVersion },
    });
  }

  // --- multi-model frame scrubbing ---

  getModelCount(): number {
    return this.modelCount;
  }

  // Switch the visible frame by updating the model-from-trajectory transform's (zero-based)
  // modelIndex; Mol* recomputes the structure + representations downstream automatically.
  async setModelIndex(index: number): Promise<void> {
    if (!this.ctx || !this.modelRef) return;
    await this.ctx.state.data
      .build()
      .to(this.modelRef)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update((old: any) => ({ ...old, modelIndex: index }))
      .commit();
  }

  async clear(): Promise<void> {
    this.modelRef = null;
    this.modelCount = 1;
    this.prevHighlight = null;
    if (!this.ctx) return;
    await PluginCommands.State.RemoveObject(this.ctx, {
      state: this.ctx.state.data,
      ref: this.ctx.state.data.tree.root.ref,
      removeParentGhosts: true,
    });
  }

  // --- camera ---

  resetCamera(durationMs = 250): void {
    if (!this.ctx) return;
    PluginCommands.Camera.Reset(this.ctx, { durationMs });
  }

  // --- structure access (for building queries) ---

  getCurrentStructure(): Structure | undefined {
    return this.ctx?.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
  }

  // --- highlight / focus / selection ---

  // the loci this class last marked directly on the canvas (see highlightLoci)
  private prevHighlight: StructureElement.Loci | null = null;

  highlightLoci(loci: StructureElement.Loci | null): void {
    if (!this.ctx) return;
    if (!loci || StructureElement.Loci.isEmpty(loci)) {
      this.ctx.managers.interactivity.lociHighlights.clearHighlights();
    } else {
      // highlightOnly, not highlight: plain highlight() ACCUMULATES marks, so sweeping
      // the cursor across the barplot lit up every residue passed over at once.
      this.ctx.managers.interactivity.lociHighlights.highlightOnly({ loci }, false);
    }
    // The lab spec disables the HighlightLoci behavior's own marking (mark: false), so
    // mark the canvas directly as well, clearing our previous mark by hand.
    const canvas = this.ctx.canvas3d;
    if (!canvas) return;
    if (this.prevHighlight) {
      canvas.mark({ loci: this.prevHighlight }, MarkerAction.RemoveHighlight);
      this.prevHighlight = null;
    }
    if (loci && !StructureElement.Loci.isEmpty(loci)) {
      canvas.mark({ loci }, MarkerAction.Highlight);
      this.prevHighlight = loci;
    }
  }

  focusLoci(loci: StructureElement.Loci, durationMs = 250): void {
    if (!this.ctx || StructureElement.Loci.isEmpty(loci)) return;
    this.ctx.managers.camera.focusLoci(loci, { durationMs });
  }

  clearSelection(): void {
    this.ctx?.managers.interactivity.lociSelects.deselectAll();
    this.ctx?.managers.structure.selection.clear();
  }

  // Routed through lociSelects (not structure.selection.fromLoci) so the SelectLoci
  // behavior's mark provider runs: the selection gets Mol*'s default green marker tint.
  setSelection(loci: StructureElement.Loci): void {
    this.ctx?.managers.interactivity.lociSelects.selectOnly({ loci }, false);
  }

  // --- interaction events ---

  subscribeToHover(callback: (info: PickInfo | null) => void): () => void {
    if (!this.ctx) return () => {};
    const sub = this.ctx.behaviors.interaction.hover.subscribe((e) => callback(pickFromLoci(e)));
    return () => sub.unsubscribe();
  }

  subscribeToClick(callback: (info: PickInfo | null) => void): () => void {
    if (!this.ctx) return () => {};
    const sub = this.ctx.behaviors.interaction.click.subscribe((e) => callback(pickFromLoci(e)));
    return () => sub.unsubscribe();
  }

  dispose(): void {
    this.ctx?.dispose();
    this.ctx = null;
    this.initPromise = null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickFromLoci(e: any): PickInfo | null {
  let loci = e?.current?.loci;
  // A pick on a STICK is a Bond.Loci, not an atom; resolve it to its end atoms.
  if (Bond.isLoci(loci) && loci.bonds.length > 0) loci = Bond.toStructureElementLoci(loci);
  if (!StructureElement.Loci.is(loci) || StructureElement.Loci.isEmpty(loci)) return null;
  let info: PickInfo | null = null;
  StructureElement.Loci.forEachLocation(loci, (location) => {
    if (info) return;
    const rawIns = StructureProperties.residue.pdbx_PDB_ins_code(location);
    info = {
      chainId: StructureProperties.chain.auth_asym_id(location),
      authSeqId: StructureProperties.residue.auth_seq_id(location),
      compId: StructureProperties.atom.label_comp_id(location),
      atomId: StructureProperties.atom.label_atom_id(location),
      altId: StructureProperties.atom.label_alt_id(location) ?? "",
      insCode: rawIns === "?" || rawIns === "." ? "" : (rawIns ?? ""),
    };
  });
  return info;
}
