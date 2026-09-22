// A fake api.astria.ai for fixture mode (`?mock=1`): catalog, account,
// workspaces, a generation that "finishes" after a few seconds with a drawn
// image, and image downloads. Any key starting with sd_ is accepted. Nothing
// here is ever used against the real backend.

const CATALOG = {
  models: {
    "tune-1": { id: 1, title: "Nano Banana 2 - Gemini 3.1", group: "Popular", icon: "provider-google", resolutions: ["1K", "2K", "4K"], default_resolution: "1K", aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], fields: { num_images: true, prompt: true, prompt_optional: false, input_image_required: false }, avg_time: 6, timeout: 60, timing: { "1K": { avg_time: 6, timeout: 60 }, "2K": { avg_time: 9, timeout: 90 }, "4K": { avg_time: 14, timeout: 120 } } },
    "tune-2": { id: 2, title: "Seedream 4.5", group: "Popular", icon: "provider-bytedance", aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4"], payload: { seed: -1 }, fields: { num_images: true, prompt: true }, avg_time: 5, timeout: 60 },
    "tune-3": { id: 3, title: "GPT Image 2", group: "Public", icon: "provider-openai", resolutions: ["1K", "2K"], default_resolution: "1K", qualities: ["low", "medium", "high"], default_quality: "medium", support_mask: true, payload: { text: "--disable_mask_crop_resize" }, aspect_ratios: ["1:1", "3:2", "2:3"], fields: { num_images: true, prompt: true }, avg_time: 8, timeout: 90 },
    "tune-4": { id: 4, title: "Flux 2 Pro", group: "Public", icon: "provider-flux", aspect_ratios: ["1:1", "16:9", "9:16"], fields: { num_images: true, prompt: true }, avg_time: 5, timeout: 60 },
    "direct-gemini-2.5": { id: 5, title: "Direct Gemini 2.5", url: "gemini-2.5-flash-image", group: "Direct Gemini" },
    "remove-background": { id: 6, title: "Remove background", group: "Tools", icon: "provider-flux", payload: { text: "--remove_background", denoising_strength: 0, num_images: 1 }, aspect_ratios: null, fields: { prompt: false, prompt_optional: true, num_images: false }, avg_time: 4, timeout: 60 }
  },
  default_model: "tune-1",
  num_images: [1, 2, 3, 4, 8],
  versions: { stable: "2.0.24", beta: "2.0.43" },
  agent_enabled: false,
  default_modifier: "none",
  modifiers: {}
};

const ACCOUNT = { email: "designer@example.com", name: "Dana Designer", usd_balance_mc: 1_234_500, payer: { id: 1, name: "Dana Designer", self: true, usd_balance_mc: 1_234_500 } };

const WORKSPACES = [
  { id: 41, title: "Lookbook Studio", favicon_url: "", slug: "lookbook" },
  { id: 42, title: "Client: Nordic Shoes", favicon_url: "", slug: "nordic" }
];

type MockPrompt = { id: number; createdAt: number; images: string[]; numImages: number; text: string };

const prompts = new Map<number, MockPrompt>();
let promptSequence = 100;
const images = new Map<string, Blob>();

async function drawResult(text: string, index: number, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const hue = (index * 67 + text.length * 13) % 360;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue} 70% 55%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 35%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `bold ${Math.round(width / 14)}px system-ui, sans-serif`;
  ctx.fillText(`Mock result ${index + 1}`, width * 0.06, height * 0.5);
  ctx.font = `${Math.round(width / 28)}px system-ui, sans-serif`;
  ctx.fillText(text.slice(0, 40), width * 0.06, height * 0.6);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function authorized(init?: RequestInit): boolean {
  const headers = new Headers(init?.headers);
  const auth = headers.get("Authorization") || "";
  return /^Bearer sd_/.test(auth);
}

/** A fetch that answers like the backend would; unknown URLs go to the real fetch (for the drawn images). */
export function mockFetch(baseUrl: string): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const imageBlob = images.get(url);
    if (imageBlob) return new Response(imageBlob, { status: 200, headers: { "Content-Type": imageBlob.type } });
    if (!url.startsWith(baseUrl)) return fetch(input, init);
    const path = url.slice(baseUrl.length).split("?")[0];
    const method = (init?.method || "GET").toUpperCase();
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!authorized(init)) return new Response("HTTP Token: Access denied.", { status: 401, headers: { "Content-Type": "text/plain" } });

    if (path === "plugin/models") return json(CATALOG);
    if (path === "users") {
      const workspace = new Headers(init?.headers).get("X-Workspace-Id");
      if (workspace === "42") return json({ ...ACCOUNT, payer: { id: 9, name: "Nordic Shoes", self: false, usd_balance_mc: 50_000 } });
      return json(ACCOUNT);
    }
    if (path === "workspaces.json") return json(WORKSPACES);
    if (path === "tunes" && method === "POST") return json({ id: 900 + prompts.size, title: `subject ${Date.now()}` });
    const create = /^tunes\/(\d+)\/prompts$/.exec(path);
    if (create && method === "POST") {
      const form = init?.body as FormData;
      const text = String(form.get("prompt[text]") || "");
      if (/fail/i.test(text)) return json({ text: ["contains a forbidden word"] }, 422);
      const numImages = Number(form.get("prompt[num_images]") || 1);
      const inputImage = form.get("prompt[input_image]");
      if (!(inputImage instanceof Blob)) return json({ input_image: ["is missing"] }, 422);
      const id = ++promptSequence;
      prompts.set(id, { id, createdAt: Date.now(), images: [], numImages, text });
      return json({ id, trained_at: null, images: [], workspace_id: new Headers(init?.headers).get("X-Workspace-Id") || null, tune_id: Number(create[1]) }, 201);
    }
    const show = /^prompts\/(\d+)$/.exec(path);
    if (show && method === "GET") {
      const prompt = prompts.get(Number(show[1]));
      if (!prompt) return json({ status: 404, error: "Not Found" }, 404);
      const age = (Date.now() - prompt.createdAt) / 1000;
      // Queued for the first second, then processing against a 6 s P90 (drawn
      // results land after 7 s, so the countdown visibly passes its estimate).
      const started = age >= 1;
      const done = age > 7;
      if (done && prompt.images.length === 0) {
        for (let index = 0; index < prompt.numImages; index++) {
          const imageUrl = `https://mp.astria.ai/mock/${prompt.id}-${index}.jpg`;
          images.set(imageUrl, await drawResult(prompt.text, index, 1024, 768));
          prompt.images.push(imageUrl);
        }
      }
      const progress = done ? {} : { progress_timing_seconds: 6, progress_elapsed_seconds: started ? Math.floor(age - 1) : 0 };
      return json({ id: prompt.id, trained_at: done ? new Date().toISOString() : null, started_training_at: started ? new Date(prompt.createdAt + 1000).toISOString() : null, user_error: /error/i.test(prompt.text) && done ? "The provider refused this prompt." : null, images: done ? prompt.images : [], workspace_id: null, ...progress });
    }
    if (method === "DELETE") return new Response(null, { status: 204 });
    return json({ status: 404, error: "Not Found" }, 404);
  };
}
