// Copied from rtviii/hetstar @ fc08cdb, packages/hetstar/src/lib/molstar/queries.ts.
// Trimmed to the residue query and its cached loci lookup; the altloc, water and
// component selectors are dropped.

import { QueryContext, StructureElement, StructureSelection, type Structure } from "molstar/lib/mol-model/structure";
import { MolScriptBuilder as MS } from "molstar/lib/mol-script/language/builder";
import { compile } from "molstar/lib/mol-script/runtime/query/compiler";

// MolScript query builders + execution: the bridge between "a chain/residue id"
// and a Mol* loci you can highlight/focus.

export const buildResidueQuery = (chainId: string, startResidue: number, endResidue?: number) => {
  const residueTest =
    endResidue !== undefined
      ? MS.core.rel.inRange([MS.ammp("auth_seq_id"), startResidue, endResidue])
      : MS.core.rel.eq([MS.ammp("auth_seq_id"), startResidue]);
  return MS.struct.generator.atomGroups({
    "chain-test": MS.core.rel.eq([MS.ammp("auth_asym_id"), chainId]),
    "residue-test": residueTest,
  });
};

// Residue/range loci with a compiled-query cache. Compilation is structure-independent
// and drag/hover over the lanes asks for the same few keys at pointer rate, so the
// MolScript compile (the expensive half of executeQuery) runs once per distinct range.
const residueQueryCache = new Map<string, (ctx: QueryContext) => StructureSelection>();

export const residueLoci = (
  structure: Structure,
  chainId: string,
  from: number,
  to: number = from,
): StructureElement.Loci | null => {
  const key = `${chainId}|${from}|${to}`;
  let compiled = residueQueryCache.get(key);
  if (!compiled) {
    if (residueQueryCache.size >= 512) residueQueryCache.clear();
    compiled = compile<StructureSelection>(buildResidueQuery(chainId, from, to === from ? undefined : to));
    residueQueryCache.set(key, compiled);
  }
  const selection = compiled(new QueryContext(structure));
  if (StructureSelection.isEmpty(selection)) return null;
  return StructureSelection.toLociWithSourceUnits(selection);
};
