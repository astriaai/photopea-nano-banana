# Astria Photopea plugin (version 2)

Status as of 2026-09-21: implemented as a preview build under `next/`, served
at `https://astriaai.github.io/photopea-nano-banana/next/` beside the legacy
plugin at the repository root. The published build was exercised end to end
inside Photopea's plugin panel (app version 30) with a mock backend, the
production API answers it from that origin, and one paid generation ran
through the plugin against api.astria.ai. The production plugin URL and
manifest are unchanged.

## Layout

```
plugin/                     Vite root (index.html, public/icon.jpeg)
plugin/src/app/             bootstrap, controller (all state changes), store, state types, generation job
plugin/src/components/ui/   owned shadcn-style Radix components (ported, see file headers)
plugin/src/features/        account, composer, history, generation UI
plugin/src/domain/          pure logic: catalog, request text, geometry, history, image, errors
plugin/src/services/astria/ HTTP client, backend contract, links, mock backend
plugin/src/host/            Host interface, Photopea transport/scripts/adapter, capture, placement, fixture host
plugin/src/storage/         versioned localStorage with the legacy-key migration
next/                       committed build output (GitHub Pages serves main)
```

React reads the store through `useSyncExternalStore`; only `AppController`
changes it. Components call the controller; only `host/photopea/scripts.ts`
contains JavaScript that Photopea executes.

## Photopea host protocol

Photopea's live messaging takes a script string by `postMessage` and answers
with echoed strings, exported binaries and `"done"`. Running scripts in
Photopea 30 showed why `"done"` cannot terminate a request:

- `"done"` is also sent when a document is created or closed, sometimes before
  the script's own output.
- A fatal interpreter error (reading a property of `undefined`) ends the
  script silently: no output, no `"done"`, and `try/catch` does not see it.
- `finally` blocks do not run, and a `return` inside `try` is lost.
- After `selection.deselect()` or a reveal-selection mask, `selection.bounds`
  throws instead of returning null; a fresh document returns null.
- `layer.bounds` reports the selection bounds while a selection is active,
  and only the opaque region of a layer otherwise.
- `app.open(dataUrl, null, true)` places a smart object synchronously, at
  100% or fitted inside the canvas when larger, centred.
- `Document.channels` is undefined; `executeAction` with `charIDToTypeID`
  works, so a selection can be stored as a temporary layer mask (`Mk` with
  `RvlS`) and reloaded (`setd` from the mask channel). `RvlS` clears the
  selection.
- Documents have no id; `app.documents[i] === app.activeDocument` is false.
  Identity is name + source + size, with the index as a hint.
- `historyStates` exist but there is no `suspendHistory`: a placement is
  several undo steps.

The transport (`transport.ts`) wraps every script with a reply prefix
(`@<id>:`), an error echo from a `catch`, and an end marker; it ignores
`"done"`, MSFAPI pings and replies for other ids; runs one request at a time;
and after a timeout sends a ping that must be answered before the next
request. Scripts are ES5, read the selection through a guarded helper, and
every mutation is followed by a verification read.

### Capture

`host/capture.ts`: inspect → export the composite (PNG) → export the
selection mask (a temporary layer filled white inside and black outside the
selection, exported alone) → crop both to the generation rectangle in the
browser → encode (JPEG, or PNG when transparent) under a 4096² pixel cap.
The generation rectangle comes from `domain/geometry.ts` (ported from the
Photoshop plugin): context padding, a minimum side of 1024, the nearest
catalog aspect ratio that still fits the canvas, never cropping the
selection. Whole-canvas editing without a selection is preserved.

### Placement

`host/placement.ts`, per job: select the document by identity → if a
selection is active, store it in a temporary layer mask and deselect → per
image: open as a smart object, verify the new layer id and kind, derive the
layer extent from the image size and Photopea's fit rule, resize uniformly to
cover the capture rectangle, centre, rename, then (when the current
selection equals the captured one) reload the stored selection, expand and
feather it by 2% of the short side (4–48 px) and add it as a reveal mask →
reload the stored selection, remove the temporary layer, activate the last
placed layer. When the selection changed or was cleared meanwhile, the mask
captured at generation time is baked into the image's alpha instead and the
user is told. Any failure restores the selection, removes temporary layers
and reports which images were placed; the images stay retained for
"Place again" or "Download".

## Generation lifecycle

`idle → capturing → submitting → generating → downloading → placing →
succeeded | failed | cancelled`. The composer is snapshotted at submission.
References are uploaded as a temporary `faceid` tune and the prompt is
created under it. Polling is bounded by the catalog's per-resolution timeout.
Stop aborts local waiting only; the message says the server may still finish
and bill. Nothing is deleted server-side (see open decisions). Images are
retained before placement so a placement failure never costs a generation.
Balance is refreshed after every job without masking its outcome.

## Backend contract used

- `GET plugin/models` (catalog with `fields`, resolutions, qualities,
  aspect ratios, timing); direct-provider rows are hidden.
- `GET users` (account and payer, with `X-Workspace-Id`), `GET workspaces.json`.
- `POST tunes` (references), `POST tunes/:id/prompts`, `GET prompts/:id`.
- Result images from the CDN with plain cross-origin GETs.
- A 401 is plain text; the client maps it to a sign-in prompt.
- The backend identifies plugins by User-Agent only, which a browser cannot
  set, so this client is an ordinary API caller: no automatic deletion, no
  version gating, `agent_enabled` false.

## Development

```
npm install
npm run dev        # https://localhost:4443 (needs server.pem; the origin the API allows)
npm run check      # tsc
npm run test       # vitest
npm run build      # writes next/ (commit it to deploy the preview)
```

Query parameters on the plugin page:

- `fixture=1`: fake host with an in-memory document (also the default when the
  page is not embedded).
- `mock=1`: fake api.astria.ai; any key starting with `sd_` is accepted, a
  prompt containing "fail" is rejected, "error" fails during generation.
- `host=embed`: this page hosts Photopea in a side frame and drives it
  through the same transport. Use it from a plain HTTP origin when the
  self-signed certificate is not trusted.
- On the dev server only, `window.__astria` exposes the host, transport and
  controller for console or Playwright driving; the production bundle strips it.
- `api=<url>`: another backend. `hostOrigin=<origin>`: an extra embedding origin.

`environment.next.json` loads the preview build in Photopea; paste it into
the [Photopea playground](https://www.photopea.com/api/playground) or open
`https://www.photopea.com#<url-encoded json>`.

## Validation record

Automated (Vitest, 40 tests): transport ordering, timeouts, late replies and
recovery; geometry; catalog normalisation; request text assembly; history;
storage migration and fallback.

Browser (Chromium pane, fixture + mock): sign-in, composer at 420×640,
240×420 and 320×260, model picker, Cmd/Ctrl+Enter, the full stage sequence,
success and failure states.

Photopea 30 (embedded mode, mock backend, 500×371 document): inspect;
irregular polygon selection stored, placed image resized and centred within
1 px, reveal mask with feathered edge, selection restored; the same through
the UI with the layer named after the prompt; whole-canvas placement of two
images; selection changed during generation (baked mask, warning); the
Remove background tool on an exact selection; document closed during
generation, retained result, reopened document matched by identity, placed
again without regeneration; transport recovery after a timed-out request.

Published build inside Photopea's own plugin panel
(`https://astriaai.github.io/photopea-nano-banana/next/?mock=1` loaded through
an `environment.plugins` entry, panel at its default 300 px width and at
340 px): handshake on load; sign-in; a magic-wand selection of the pug's face
edited and placed as a smart object masked to that irregular selection, with
Photopea's history showing Expand, Feather, Add Raster Mask and the temporary
layer's removal, and the selection restored; the current layer added as a
reference (masked smart object exported alone and trimmed) and a second
generation through the reference-tune path; the History pill listing and
starring the prompt; Cmd+Enter from the textarea; Stop during generation with
nothing placed; sign-out clearing the stored key (reload shows sign-in);
sign-in surviving a reload of the plugin frame (third-party storage persists).

Production API from the published origin (no credentials): `plugin/models`,
`users` and `workspaces.json` answer 401 through CORS, and a bogus key
entered in the published sign-in screen shows "That API key was rejected".

Paid generation (real Photopea, real api.astria.ai through a local
header-injecting proxy so the key never entered the browser): sign-in showed
the real account, balance, workspaces and catalog (30 models); a 200×180
selection on the pug edited with Nano Banana 2 at 1K, one image, prompt
46836924, cost 33,000 mc ($0.33), the catalog's "usually about 1m 50s"
estimate shown while polling, the result downloaded from the CDN and placed as
a masked smart object named after the prompt with the selection restored, the
balance refreshed afterwards. The request text carried the prompt followed by
the preservation paragraph.

Not yet exercised: dropping files from the OS onto the panel; nested and
hidden layers; very large documents; Safari and Firefox.

## Open decisions

1. Retention: nothing is deleted. Reference tunes (`subject <timestamp>`)
   and prompts stay in the account, unlike the Photoshop plugin whose
   Photoshop User-Agent triggers server-side deletion after 10 minutes.
   Deleting the temporary tune would also delete its prompt and images.
2. Undo: a placement is several history steps in Photopea.
3. Theme: Photopea does not expose its theme; the panel is dark, with light
   tokens defined behind `data-theme="light"`.
4. Attribution: the backend has no plugin identification channel other than
   the User-Agent; `aff=photopea` and UTM parameters are sent on links only.
5. Cutover: replacing the root `index.html` with the build (and retiring the
   legacy files) once a paid generation has been validated from the
   production origin.

## Rollout and rollback

The preview is whatever `next/` holds on `main`; GitHub Pages builds
`main` at `/`. Deploy by committing a new build; roll back by reverting that
commit. Assets are content-hashed. The legacy plugin at the root keeps
serving installed users, and the versioned storage migrates their saved key
when they open the new build on the same origin.
