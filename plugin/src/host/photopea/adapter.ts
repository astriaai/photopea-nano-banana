import { boundsFromArray, type Bounds } from "../../domain/geometry";
import { HostError, type DocumentIdentity, type DocumentInfo, type Host, type HostInspection, type PlacedLayerCheck, type TransformResult } from "../types";
import { layerName, scripts } from "./scripts";
import { PhotopeaTransport, type ScriptReply } from "./transport";

/** Name prefix of every temporary layer this plugin creates, so recovery can find them. */
export const TEMP_LAYER_PREFIX = "__astria_tmp";

type Json = Record<string, unknown>;

function parseValue(reply: ScriptReply, index = 0): Json {
  const raw = reply.values[index];
  if (raw === undefined) throw new HostError("script", reply.error ? `Photopea: ${reply.error}` : "Photopea returned no result.");
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object") return value as Json;
  } catch {
    // fall through
  }
  throw new HostError("script", "Photopea returned an unreadable result.");
}

function scriptError(value: Json): string | null {
  return typeof value.error === "string" ? value.error : null;
}

function asNumberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

function parseDocument(value: unknown): DocumentInfo {
  const json = (value && typeof value === "object" ? value : {}) as Json;
  const width = Number(json.width);
  const height = Number(json.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new HostError("script", "Photopea did not report the document size.");
  return {
    index: Number.isFinite(Number(json.index)) ? Number(json.index) : -1,
    name: String(json.name ?? ""),
    source: String(json.source ?? ""),
    width,
    height,
    layerCount: Number(json.layerCount) || 0,
    layerIds: asNumberList(json.layerIds),
    activeLayerId: Number(json.activeLayerId) || 0,
    activeLayerName: String(json.activeLayerName ?? ""),
    selection: boundsFromArray(Array.isArray(json.selection) ? (json.selection as number[]) : null)
  };
}

function hex(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toLowerCase()}` : null;
}

export class PhotopeaHost implements Host {
  readonly kind = "photopea" as const;
  private transport: PhotopeaTransport;

  constructor(transport: PhotopeaTransport) {
    this.transport = transport;
  }

  get busy(): boolean {
    return this.transport.busy;
  }

  private async run(body: string, options: { timeoutMs?: number } = {}): Promise<{ reply: ScriptReply; value: Json }> {
    const reply = await this.transport.run(body, options);
    if (reply.error && reply.values.length === 0) throw new HostError("script", `Photopea: ${reply.error}`);
    const value = parseValue(reply);
    const error = scriptError(value);
    if (error === "no-document") throw new HostError("no-document", "Open or create a document in Photopea first.");
    if (error === "no-selection") throw new HostError("no-selection", "There is no selection in the document.");
    if (error === "layer-missing") throw new HostError("layer-missing", "A layer this operation needs is no longer in the document.");
    if (error) throw new HostError("script", `Photopea: ${error}`);
    return { reply, value };
  }

  async ping(): Promise<void> {
    try {
      await this.run(scripts.ping(), { timeoutMs: 5_000 });
    } catch (error) {
      if (error instanceof HostError && error.code === "timeout") {
        throw new HostError("unavailable", "Photopea did not respond. Open this plugin from Photopea's Plugins panel.");
      }
      throw error;
    }
  }

  async inspect(): Promise<HostInspection> {
    const { value } = await this.run(scripts.inspect());
    const hasDocument = value.hasDocument === true;
    return {
      hasDocument,
      documentCount: Number(value.documentCount) || 0,
      document: hasDocument ? parseDocument(value.document) : null,
      foregroundHex: hex(value.foreground)
    };
  }

  private requireBuffer(reply: ScriptReply, what: string): ArrayBuffer {
    const buffer = reply.buffers[reply.buffers.length - 1];
    if (!buffer || buffer.byteLength === 0) throw new HostError("script", `Photopea did not export ${what}.`);
    return buffer;
  }

  async exportComposite(): Promise<ArrayBuffer> {
    const { reply } = await this.run(scripts.exportComposite(), { timeoutMs: 120_000 });
    return this.requireBuffer(reply, "the image");
  }

  async exportSelectionMask(): Promise<ArrayBuffer> {
    const { reply } = await this.run(scripts.exportSelectionMask(`${TEMP_LAYER_PREFIX}_mask`), { timeoutMs: 120_000 });
    return this.requireBuffer(reply, "the selection mask");
  }

  async exportActiveLayer(): Promise<{ bytes: ArrayBuffer; name: string }> {
    const { reply, value } = await this.run(scripts.exportActiveLayer(), { timeoutMs: 120_000 });
    return { bytes: this.requireBuffer(reply, "the layer"), name: String(value.name ?? "Layer") };
  }

  async selectDocument(identity: DocumentIdentity): Promise<DocumentInfo | null> {
    const { value } = await this.run(scripts.selectDocument(identity.name, identity.source, identity.width, identity.height, identity.index));
    if (value.found !== true) {
      if (Number(value.matches) > 1) throw new HostError("document-ambiguous", "Several open documents look like the one this image was generated for. Close the copies and retry placing.");
      return null;
    }
    return parseDocument(value.document);
  }

  async storeSelection(name: string): Promise<{ tempLayerId: number } | null> {
    const { value } = await this.run(scripts.storeSelection(name));
    if (value.stored !== true) return null;
    const tempLayerId = Number(value.tempId);
    if (!Number.isFinite(tempLayerId)) throw new HostError("script", "Photopea did not report the temporary layer.");
    return { tempLayerId };
  }

  async deselect(): Promise<void> {
    await this.run(scripts.deselect());
  }

  async placeImage(dataUrl: string): Promise<{ before: number[] }> {
    const { value } = await this.run(scripts.placeImage(dataUrl), { timeoutMs: 120_000 });
    return { before: asNumberList(value.before) };
  }

  async verifyPlaced(before: number[]): Promise<PlacedLayerCheck> {
    const { value } = await this.run(scripts.verifyPlaced(before));
    return {
      newIds: asNumberList(value.newIds),
      activeId: Number(value.activeId) || 0,
      activeIsNew: value.activeIsNew === true,
      isSmartObject: value.smart === true,
      bounds: boundsFromArray(Array.isArray(value.bounds) ? (value.bounds as number[]) : null),
      hasSelection: value.hasSelection === true
    };
  }

  async transformLayer(layerId: number, percent: number, target: Bounds, name: string): Promise<TransformResult> {
    const { value } = await this.run(scripts.transformLayer(layerId, percent, target, layerName(name)), { timeoutMs: 60_000 });
    const bounds = (key: string) => boundsFromArray(Array.isArray(value[key]) ? (value[key] as number[]) : null);
    return { before: bounds("before"), resized: bounds("resized"), placed: bounds("placed") };
  }

  async applyRevealMask(tempLayerId: number, layerId: number, radius: number): Promise<void> {
    await this.run(scripts.applyRevealMask(tempLayerId, layerId, radius), { timeoutMs: 60_000 });
  }

  async restoreSelection(tempLayerId: number, activateLayerId: number | null): Promise<void> {
    await this.run(scripts.restoreSelection(tempLayerId, activateLayerId), { timeoutMs: 60_000 });
  }

  async removeLayersByPrefix(prefix: string): Promise<number> {
    const { value } = await this.run(scripts.removeLayersByPrefix(prefix));
    return Number(value.removed) || 0;
  }
}
