// The JavaScript Photopea executes. Photopea runs scripts in its own ES5-style
// interpreter: no arrow functions, template strings, let/const, spread or
// try/finally (a `finally` block is not run), and a fatal interpreter error
// (such as reading a property of undefined) ends the script silently without
// the `done` acknowledgement. Every script therefore reports through markers
// the transport recognises, keeps statements simple, and is followed by a
// separate verification read rather than trusting its own side effects.
//
// Arguments are serialised with `arg()`; prompt text never reaches a script
// except as a JSON string literal.

/** JSON literal safe to paste into the script (U+2028/2029 are line terminators in older parsers). */
export function arg(value: string | number | boolean | null | number[] | string[]): string {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Cannot pass ${value} to Photopea.`);
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** A layer name Photopea accepts: single line, no control characters, bounded. */
export function layerName(text: string, fallback = "Astria"): string {
  // eslint-disable-next-line no-control-regex
  const clean = String(text || "").replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim();
  return (clean || fallback).slice(0, 80);
}

// Helpers every script can call. `__r` (the reply prefix) is declared by the transport.
export const PRELUDE = `
function __emit(v) { app.echoToOE(__r + JSON.stringify(v)); }
function __b(b) { return b ? [b[0].value, b[1].value, b[2].value, b[3].value] : null; }
function __ids(d) { var r = []; for (var i = 0; i < d.layers.length; i++) r.push(d.layers[i].id); return r; }
function __topLayer(d) { for (var i = 0; i < d.layers.length; i++) { if (d.layers[i].typename !== "LayerSet") return d.layers[i]; } return null; }
function __findLayer(d, id) { for (var i = 0; i < d.layers.length; i++) { if (d.layers[i].id === id) return d.layers[i]; } return null; }
function __docIndex(d) { for (var i = 0; i < app.documents.length; i++) { if (app.documents[i] === d) return i; } return -1; }
function __docInfo(d, index) {
  return { index: index, name: String(d.name), source: String(d.source || ""), width: d.width, height: d.height, layerCount: d.layers.length, layerIds: __ids(d), activeLayerId: d.activeLayer.id, activeLayerName: String(d.activeLayer.name), selection: __b(d.selection.bounds) };
}
function __rvls() {
  var desc = new ActionDescriptor(); var ref = new ActionReference();
  ref.putClass(charIDToTypeID("Chnl")); desc.putReference(charIDToTypeID("null"), ref);
  var at = new ActionReference(); at.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  desc.putReference(charIDToTypeID("At  "), at);
  desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
  executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
}
function __loadMaskSelection() {
  var desc = new ActionDescriptor(); var ref = new ActionReference();
  ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel")); desc.putReference(charIDToTypeID("null"), ref);
  var from = new ActionReference(); from.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
  desc.putReference(charIDToTypeID("T   "), from);
  executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}
`;

export type ScriptBounds = { left: number; top: number; right: number; bottom: number };

export const scripts = {
  ping: () => `__emit({ pong: true });`,

  inspect: () => `
var fg = null; try { fg = String(app.foregroundColor.rgb.hexValue); } catch (e) { fg = null; }
var n = app.documents.length;
if (!n) { __emit({ hasDocument: false, documentCount: 0, document: null, foreground: fg }); }
else { var d = app.activeDocument; __emit({ hasDocument: true, documentCount: n, document: __docInfo(d, __docIndex(d)), foreground: fg }); }`,

  exportComposite: () => `
if (!app.documents.length) { __emit({ error: "no-document" }); }
else { app.activeDocument.saveToOE("png"); __emit({ ok: true }); }`,

  // A temporary top-level layer is filled black outside the selection and white
  // inside, exported alone, then removed. The selection itself is untouched
  // (inverted twice).
  exportSelectionMask: (tempName: string) => `
if (!app.documents.length) { __emit({ error: "no-document" }); }
else {
  var d = app.activeDocument;
  if (!d.selection.bounds) { __emit({ error: "no-selection" }); }
  else {
    var prevId = d.activeLayer.id;
    var top = __topLayer(d); if (top) d.activeLayer = top;
    var L = d.artLayers.add(); L.name = ${arg(tempName)};
    var vis = []; for (var i = 0; i < d.layers.length; i++) vis.push(d.layers[i].visible);
    var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
    var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
    d.selection.invert(); d.selection.fill(black); d.selection.invert(); d.selection.fill(white);
    for (var j = 0; j < d.layers.length; j++) d.layers[j].visible = (d.layers[j].id === L.id);
    d.saveToOE("png");
    for (var k = 0; k < d.layers.length; k++) d.layers[k].visible = vis[k];
    L.remove();
    var prev = __findLayer(d, prevId); if (prev) d.activeLayer = prev;
    __emit({ ok: true });
  }
}`,

  // Every layer is hidden except the active one, its ancestors and (when it is
  // a group) its descendants, then the document is exported and visibility restored.
  exportActiveLayer: () => `
if (!app.documents.length) { __emit({ error: "no-document" }); }
else {
  var d = app.activeDocument; var active = d.activeLayer;
  function all(container) { var r = []; for (var i = 0; i < container.layers.length; i++) { var L = container.layers[i]; r.push(L); if (L.typename === "LayerSet") r = r.concat(all(L)); } return r; }
  function inside(L, ancestor) { var cur = L; var n = 0; while (cur && n < 32) { n++; if (cur === ancestor) return true; if (cur.parent && cur.parent.typename !== "Document") cur = cur.parent; else return false; } return false; }
  var layers = all(d); var vis = []; for (var i = 0; i < layers.length; i++) vis.push(layers[i].visible);
  for (var j = 0; j < layers.length; j++) layers[j].visible = false;
  var cur = active; var nest = 0;
  while (cur && nest < 32) { cur.visible = true; nest++; if (cur.parent && cur.parent.typename !== "Document") cur = cur.parent; else break; }
  if (active.typename === "LayerSet") { for (var m = 0; m < layers.length; m++) { if (layers[m] !== active && inside(layers[m], active)) layers[m].visible = vis[m]; } }
  d.saveToOE("png");
  for (var k = 0; k < layers.length; k++) layers[k].visible = vis[k];
  __emit({ ok: true, name: String(active.name), kind: String(active.kind) });
}`,

  selectDocument: (name: string, source: string, width: number, height: number, hint: number) => `
var n = app.documents.length; var matches = [];
for (var i = 0; i < n; i++) { var d = app.documents[i]; if (String(d.name) === ${arg(name)} && String(d.source || "") === ${arg(source)} && d.width === ${arg(width)} && d.height === ${arg(height)}) matches.push(i); }
var idx = -1;
if (matches.length === 1) idx = matches[0];
else if (matches.length > 1 && matches.indexOf(${arg(hint)}) >= 0) idx = ${arg(hint)};
if (idx < 0) { __emit({ found: false, matches: matches.length }); }
else { app.activeDocument = app.documents[idx]; var d2 = app.activeDocument; __emit({ found: true, document: __docInfo(d2, idx) }); }`,

  storeSelection: (tempName: string) => `
var d = app.activeDocument;
if (!d.selection.bounds) { __emit({ stored: false }); }
else {
  var top = __topLayer(d); if (top) d.activeLayer = top;
  var T = d.artLayers.add(); T.name = ${arg(tempName)};
  __rvls();
  __emit({ stored: true, tempId: T.id });
}`,

  deselect: () => `
var d = app.activeDocument; if (d.selection.bounds) d.selection.deselect(); __emit({ ok: true });`,

  placeImage: (dataUrl: string) => `
var d = app.activeDocument; var top = __topLayer(d); if (top) d.activeLayer = top;
var before = __ids(d);
app.open(${arg(dataUrl)}, null, true);
__emit({ before: before });`,

  verifyPlaced: (before: number[]) => `
var d = app.activeDocument; var ids = __ids(d); var newIds = []; var before = ${arg(before)};
for (var i = 0; i < ids.length; i++) { if (before.indexOf(ids[i]) < 0) newIds.push(ids[i]); }
var L = d.activeLayer;
__emit({ newIds: newIds, activeId: L.id, activeIsNew: before.indexOf(L.id) < 0, smart: L.kind == LayerKind.SMARTOBJECT, bounds: __b(L.bounds), hasSelection: !!d.selection.bounds });`,

  transformLayer: (layerId: number, percent: number, target: ScriptBounds, name: string) => `
var d = app.activeDocument; var L = __findLayer(d, ${arg(layerId)});
if (!L) { __emit({ error: "layer-missing" }); }
else {
  d.activeLayer = L; if (d.selection.bounds) d.selection.deselect();
  var b1 = __b(L.bounds);
  L.resize(${arg(percent)}, ${arg(percent)}, AnchorPosition.MIDDLECENTER);
  var b2 = __b(L.bounds);
  var dx = Math.round(${arg((target.left + target.right) / 2)} - (b2[0] + b2[2]) / 2);
  var dy = Math.round(${arg((target.top + target.bottom) / 2)} - (b2[1] + b2[3]) / 2);
  if (dx !== 0 || dy !== 0) L.translate(dx, dy);
  var b3 = __b(L.bounds);
  L.name = ${arg(name)};
  __emit({ before: b1, resized: b2, placed: b3 });
}`,

  applyRevealMask: (tempLayerId: number, layerId: number, radius: number) => `
var d = app.activeDocument; var T = __findLayer(d, ${arg(tempLayerId)}); var P = __findLayer(d, ${arg(layerId)});
if (!T || !P) { __emit({ error: "layer-missing" }); }
else {
  d.activeLayer = T; __loadMaskSelection(); d.activeLayer = P;
  if (${arg(radius)} > 0) { d.selection.expand(${arg(radius)}); d.selection.feather(${arg(radius)}); }
  __rvls();
  d.selection.deselect();
  __emit({ ok: true });
}`,

  restoreSelection: (tempLayerId: number, activateLayerId: number | null) => `
var d = app.activeDocument; var T = __findLayer(d, ${arg(tempLayerId)});
if (T) { d.activeLayer = T; __loadMaskSelection(); T.remove(); }
var A = ${arg(activateLayerId)} === null ? null : __findLayer(d, ${arg(activateLayerId)}); if (A) d.activeLayer = A;
__emit({ restored: !!T, selection: __b(d.selection.bounds) });`,

  removeLayersByPrefix: (prefix: string) => `
var removed = 0;
if (app.documents.length) { var d = app.activeDocument; for (var i = d.layers.length - 1; i >= 0; i--) { if (String(d.layers[i].name).indexOf(${arg(prefix)}) === 0) { d.layers[i].remove(); removed++; } } }
__emit({ removed: removed });`
};
