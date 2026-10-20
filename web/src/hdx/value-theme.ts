import type { Location } from "molstar/lib/mol-model/location";
import { Bond, type ElementIndex, StructureElement, StructureProperties, Unit } from "molstar/lib/mol-model/structure";
import { ColorTheme } from "molstar/lib/mol-theme/color";
import { ColorThemeCategory } from "molstar/lib/mol-theme/color/categories";
import type { ThemeDataContext } from "molstar/lib/mol-theme/theme";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { Color } from "molstar/lib/mol-util/color";
import { MISSING_COLOR } from "./colors";

// Paints each residue from a table of colors keyed "chain|auth_seq_id|ins" (hetstar's
// residueKey). Modeled on hetstar's alt-loc theme. The table lives here rather than in
// the theme params, so a slider can swap thousands of colors without serializing them
// into Mol*'s state tree; MolstarViewer.recolor() bumps `version` to make Mol* re-read it.
// Residues missing from the table get MISSING_COLOR: no value is shown as no value.

let table = new Map<string, number>();

export function setResidueColors(next: Map<string, number>): void {
  table = next;
}

function residueColor(unit: Unit, element: ElementIndex): Color {
  if (!Unit.isAtomic(unit)) return Color(MISSING_COLOR);
  const loc = StructureElement.Location.create(undefined, unit, element);
  const chain = StructureProperties.chain.auth_asym_id(loc);
  const seq = StructureProperties.residue.auth_seq_id(loc);
  const rawIns = StructureProperties.residue.pdbx_PDB_ins_code(loc);
  const ins = rawIns === "?" || rawIns === "." ? "" : (rawIns ?? "");
  const c = table.get(`${chain}|${seq}|${ins}`);
  return Color(c ?? MISSING_COLOR);
}

export const HdxValueColorThemeParams = {
  version: PD.Numeric(0, {}, { isHidden: true }),
};
export type HdxValueColorThemeParams = typeof HdxValueColorThemeParams;

export function HdxValueColorTheme(
  _ctx: ThemeDataContext,
  props: PD.Values<HdxValueColorThemeParams>,
): ColorTheme<HdxValueColorThemeParams> {
  const color = (location: Location): Color => {
    if (StructureElement.Location.is(location)) return residueColor(location.unit, location.element);
    if (Bond.isLocation(location)) return residueColor(location.aUnit, location.aUnit.elements[location.aIndex]);
    return Color(MISSING_COLOR);
  };
  return {
    factory: HdxValueColorTheme,
    granularity: "group",
    color,
    props,
    description: "Colors residues by a per-residue HDX value (ΔG, protection, deuteration); grey where there is no value.",
  };
}

export const HdxValueColorThemeProvider: ColorTheme.Provider<HdxValueColorThemeParams, "hdx-value"> = {
  name: "hdx-value",
  label: "HDX value",
  category: ColorThemeCategory.Residue,
  factory: HdxValueColorTheme,
  getParams: () => HdxValueColorThemeParams,
  defaultValues: PD.getDefaultValues(HdxValueColorThemeParams),
  isApplicable: (ctx: ThemeDataContext) => !!ctx.structure,
};
