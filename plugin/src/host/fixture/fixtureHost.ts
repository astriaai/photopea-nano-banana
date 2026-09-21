// A stand-in host for developing the UI outside Photopea (`?fixture=1`, or
// any page that is not embedded). It keeps one in-memory document drawn on a
// canvas and records what would have been placed. Browser-preview success
// proves nothing about Photopea; the real host is exercised separately.

import { boundsFromArray, type Bounds } from "../../domain/geometry";
import { canvasToBlob, createCanvas } from "../../domain/image";
import { HostError, type DocumentIdentity, type DocumentInfo, type Host, type HostInspection, type PlacedLayerCheck, type TransformResult } from "../types";

export type FixtureOptions = {
  width?: number;
  height?: number;
  selection?: Bounds | null;
  hasDocument?: boolean;
  /** Simulated latency per operation. */
  delayMs?: number;
};

type FixtureLayer = { id: number; name: string; bounds: Bounds; smart: boolean; dataUrl?: string };

export class FixtureHost implements Host {
  readonly kind = "fixture" as const;
  private options: Required<FixtureOptions>;
  private layers: FixtureLayer[] = [{ id: 1, name: "Background", bounds: { left: 0, top: 0, right: 0, bottom: 0 }, smart: false }];
  private nextId = 2;
  private selection: Bounds | null;
  private activeId = 1;
  /** The temporary layer masks keyed by layer id. */
  private masks = new Map<number, Bounds>();
  /** Images placed so far, for the fixture panel. */
  readonly placed: FixtureLayer[] = [];

  constructor(options: FixtureOptions = {}) {
    this.options = {
      width: options.width ?? 1200,
      height: options.height ?? 800,
      selection: options.selection === undefined ? { left: 320, top: 200, right: 820, bottom: 620 } : options.selection,
      hasDocument: options.hasDocument ?? true,
      delayMs: options.delayMs ?? 60
    };
    this.selection = this.options.selection;
    this.layers[0].bounds = { left: 0, top: 0, right: this.options.width, bottom: this.options.height };
  }

  private async wait(): Promise<void> {
    if (this.options.delayMs) await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
  }

  private document(): DocumentInfo {
    return {
      index: 0,
      name: "fixture.psd",
      source: "local,0,fixture.psd",
      width: this.options.width,
      height: this.options.height,
      layerCount: this.layers.length,
      layerIds: this.layers.map((layer) => layer.id),
      activeLayerId: this.activeId,
      activeLayerName: this.layers.find((layer) => layer.id === this.activeId)?.name ?? "",
      selection: this.selection ? { ...this.selection } : null
    };
  }

  setSelection(selection: Bounds | null): void {
    this.selection = selection;
  }

  private requireDocument(): void {
    if (!this.options.hasDocument) throw new HostError("no-document", "Open or create a document in Photopea first.");
  }

  async ping(): Promise<void> {
    await this.wait();
  }

  async inspect(): Promise<HostInspection> {
    await this.wait();
    if (!this.options.hasDocument) return { hasDocument: false, documentCount: 0, document: null, foregroundHex: "#ff6600" };
    return { hasDocument: true, documentCount: 1, document: this.document(), foregroundHex: "#ff6600" };
  }

  private drawDocument(): HTMLCanvasElement {
    const canvas = createCanvas({ width: this.options.width, height: this.options.height });
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#2b5876");
    gradient.addColorStop(1, "#4e4376");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc((i * 173) % canvas.width, (i * 271) % canvas.height, 60 + (i % 4) * 30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px system-ui, sans-serif";
    ctx.fillText("Fixture document", 40, 80);
    return canvas;
  }

  async exportComposite(): Promise<ArrayBuffer> {
    this.requireDocument();
    await this.wait();
    return (await canvasToBlob(this.drawDocument(), "image/png")).arrayBuffer();
  }

  async exportSelectionMask(): Promise<ArrayBuffer> {
    this.requireDocument();
    if (!this.selection) throw new HostError("no-selection", "There is no selection in the document.");
    await this.wait();
    const canvas = createCanvas({ width: this.options.width, height: this.options.height });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    const s = this.selection;
    // An ellipse, so the fixture exercises an irregular mask.
    ctx.beginPath();
    ctx.ellipse((s.left + s.right) / 2, (s.top + s.bottom) / 2, (s.right - s.left) / 2, (s.bottom - s.top) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return (await canvasToBlob(canvas, "image/png")).arrayBuffer();
  }

  async exportActiveLayer(): Promise<{ bytes: ArrayBuffer; name: string }> {
    this.requireDocument();
    await this.wait();
    const canvas = createCanvas({ width: 400, height: 300 });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e0b04a";
    ctx.beginPath();
    ctx.arc(200, 150, 120, 0, Math.PI * 2);
    ctx.fill();
    return { bytes: await (await canvasToBlob(canvas, "image/png")).arrayBuffer(), name: "Fixture layer" };
  }

  async selectDocument(identity: DocumentIdentity): Promise<DocumentInfo | null> {
    await this.wait();
    if (!this.options.hasDocument) return null;
    const current = this.document();
    return identity.name === current.name && identity.source === current.source ? current : null;
  }

  async storeSelection(layerName: string): Promise<{ tempLayerId: number } | null> {
    await this.wait();
    if (!this.selection) return null;
    const id = this.nextId++;
    this.layers.unshift({ id, name: layerName, bounds: { ...this.selection }, smart: false });
    this.masks.set(id, { ...this.selection });
    return { tempLayerId: id };
  }

  async deselect(): Promise<void> {
    await this.wait();
    this.selection = null;
  }

  async placeImage(dataUrl: string): Promise<{ before: number[] }> {
    this.requireDocument();
    await this.wait();
    const before = this.layers.map((layer) => layer.id);
    const size = await imageSizeOf(dataUrl);
    const left = Math.round((this.options.width - size.width) / 2);
    const top = Math.round((this.options.height - size.height) / 2);
    const layer: FixtureLayer = { id: this.nextId++, name: "image", bounds: { left, top, right: left + size.width, bottom: top + size.height }, smart: true, dataUrl };
    this.layers.unshift(layer);
    this.activeId = layer.id;
    this.placed.push(layer);
    return { before };
  }

  async verifyPlaced(before: number[]): Promise<PlacedLayerCheck> {
    await this.wait();
    const newIds = this.layers.map((layer) => layer.id).filter((id) => !before.includes(id));
    const active = this.layers.find((layer) => layer.id === this.activeId)!;
    return { newIds, activeId: active.id, activeIsNew: !before.includes(active.id), isSmartObject: active.smart, bounds: this.selection ? { ...this.selection } : { ...active.bounds }, hasSelection: this.selection !== null };
  }

  async transformLayer(layerId: number, percent: number, target: Bounds, name: string): Promise<TransformResult> {
    await this.wait();
    const layer = this.layers.find((item) => item.id === layerId);
    if (!layer) throw new HostError("layer-missing", "A layer this operation needs is no longer in the document.");
    this.selection = null;
    const before = { ...layer.bounds };
    const w = (before.right - before.left) * (percent / 100);
    const h = (before.bottom - before.top) * (percent / 100);
    const cx = (before.left + before.right) / 2;
    const cy = (before.top + before.bottom) / 2;
    const resized = { left: Math.round(cx - w / 2), top: Math.round(cy - h / 2), right: Math.round(cx + w / 2), bottom: Math.round(cy + h / 2) };
    const dx = Math.round((target.left + target.right) / 2 - (resized.left + resized.right) / 2);
    const dy = Math.round((target.top + target.bottom) / 2 - (resized.top + resized.bottom) / 2);
    layer.bounds = { left: resized.left + dx, top: resized.top + dy, right: resized.right + dx, bottom: resized.bottom + dy };
    layer.name = name;
    return { before, resized, placed: { ...layer.bounds } };
  }

  async applyRevealMask(tempLayerId: number, layerId: number): Promise<void> {
    await this.wait();
    if (!this.masks.has(tempLayerId) || !this.layers.some((layer) => layer.id === layerId)) {
      throw new HostError("layer-missing", "A layer this operation needs is no longer in the document.");
    }
    this.selection = null;
  }

  async restoreSelection(tempLayerId: number, activateLayerId: number | null): Promise<void> {
    await this.wait();
    const mask = this.masks.get(tempLayerId);
    if (mask) this.selection = { ...mask };
    this.masks.delete(tempLayerId);
    this.layers = this.layers.filter((layer) => layer.id !== tempLayerId);
    if (activateLayerId !== null && this.layers.some((layer) => layer.id === activateLayerId)) this.activeId = activateLayerId;
  }

  async removeLayersByPrefix(prefix: string): Promise<number> {
    await this.wait();
    const before = this.layers.length;
    this.layers = this.layers.filter((layer) => !layer.name.startsWith(prefix));
    return before - this.layers.length;
  }
}

function imageSizeOf(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The fixture could not read the image."));
    image.src = dataUrl;
  });
}

export { boundsFromArray };
