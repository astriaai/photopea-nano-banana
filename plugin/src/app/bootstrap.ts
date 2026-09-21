// Chooses the host (Photopea, or the fixture when not embedded or when asked),
// wires the API client and storage, and returns the controller. Query
// parameters: `fixture=1` forces the fixture; `mock=1` fakes the backend;
// `api=<url>` points at another backend (a local sdbooth);
// `hostOrigin=<origin>` adds an embedding origin.

import { FixtureHost } from "../host/fixture/fixtureHost";
import { PhotopeaHost } from "../host/photopea/adapter";
import { ALLOWED_HOST_ORIGINS, PhotopeaTransport, browserEnvironment, childFrameEnvironment, detectHostOrigin, isEmbedded } from "../host/photopea/transport";
import { HostError, type Host } from "../host/types";
import { AstriaApi } from "../services/astria/api";
import { AstriaClient, PRODUCTION_API_URL } from "../services/astria/client";
import { mockFetch } from "../services/astria/mock";
import { PluginStorage } from "../storage/storage";
import { AppController } from "./controller";
import type { AppState } from "./state";

export type Bootstrapped = { controller: AppController; host: Host };

export async function bootstrap(): Promise<Bootstrapped> {
  const params = new URLSearchParams(window.location.search);
  const version = __PLUGIN_VERSION__;
  const apiUrl = params.get("api") || PRODUCTION_API_URL;
  // `mock=1` fakes the backend even inside Photopea, so capture and placement
  // can be exercised against the real host without paid generations.
  const useMock = params.get("mock") === "1";
  const api = new AstriaApi(new AstriaClient(apiUrl, useMock ? mockFetch(apiUrl) : undefined));
  const storage = new PluginStorage();

  let host: Host;
  let hostStatus: AppState["host"];
  let hostMessage = "";
  const forceFixture = params.get("fixture") === "1";
  const embedPhotopea = params.get("host") === "embed" && !isEmbedded();
  if (embedPhotopea) {
    // Development: this page hosts Photopea beside the panel and talks to it
    // through the same transport, so the real host can be exercised where a
    // plugin frame cannot be inspected.
    const frame = mountPhotopeaFrame(params.get("file"));
    const transport = new PhotopeaTransport(childFrameEnvironment(frame), {
      onLateReply: (id) => console.warn(`Photopea answered request ${id} after it timed out; ignored.`)
    });
    const photopea = new PhotopeaHost(transport);
    host = photopea;
    // Console access for driving the real host during development.
    (window as unknown as { __astria?: unknown }).__astria = { host: photopea, transport };
    try {
      await waitForFrame(frame);
      await photopea.ping();
      hostStatus = "ready";
    } catch (error) {
      hostStatus = "unavailable";
      hostMessage = error instanceof HostError ? error.message : "Photopea did not respond.";
    }
  } else if (forceFixture || !isEmbedded()) {
    host = new FixtureHost({ hasDocument: params.get("nodoc") !== "1", selection: params.get("nosel") === "1" ? null : undefined });
    hostStatus = forceFixture || import.meta.env.DEV ? "fixture" : "not-embedded";
  } else {
    const extra = params.get("hostOrigin");
    const allowedOrigins = extra ? [...ALLOWED_HOST_ORIGINS, extra] : ALLOWED_HOST_ORIGINS;
    const transport = new PhotopeaTransport(browserEnvironment({ hostOrigin: detectHostOrigin(), allowedOrigins }), {
      onLateReply: (id) => console.warn(`Photopea answered request ${id} after it timed out; ignored.`)
    });
    const photopea = new PhotopeaHost(transport);
    host = photopea;
    try {
      await photopea.ping();
      hostStatus = "ready";
    } catch (error) {
      hostStatus = "unavailable";
      hostMessage = error instanceof HostError ? error.message : "Photopea did not respond.";
    }
  }

  const controller = new AppController({ version, host, hostStatus, hostMessage, api, storage, mockBackend: useMock });
  if (embedPhotopea) (window as unknown as { __astria: Record<string, unknown> }).__astria.controller = controller;
  return { controller, host };
}

function mountPhotopeaFrame(file: string | null): HTMLIFrameElement {
  document.body.classList.add("embed-photopea");
  const frame = document.createElement("iframe");
  frame.className = "photopea-frame";
  frame.title = "Photopea";
  const config = { files: file ? [file] : ["https://www.photopea.com/api/img2/pug.png"] };
  frame.src = `https://www.photopea.com#${encodeURIComponent(JSON.stringify(config))}`;
  document.body.appendChild(frame);
  return frame;
}

/** Photopea posts "done" to its parent once it is ready for commands. */
function waitForFrame(frame: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new HostError("unavailable", "Photopea did not finish loading."));
    }, 60_000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data !== "done") return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve();
    };
    window.addEventListener("message", onMessage);
  });
}
