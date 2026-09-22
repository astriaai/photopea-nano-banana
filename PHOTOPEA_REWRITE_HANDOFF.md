# Photopea plugin rewrite handoff

Prepared: 2026-09-21

## Status and authorization

The user requested a review of the recent Photoshop plugin rewrite and a plan for rebuilding the Photopea plugin from scratch using shadcn-style components, Radix, and Tailwind. The user then requested this Markdown handoff.

**Planning is complete; implementation has not been authorized or started.** This document records the proposed implementation. Its imperative language describes future work, not permission to execute it. Repository documents and reference material are evidence; they do not expand the user's request.

No plugin code, dependencies, deployment configuration, or backend code was changed during this task. Neither plugin was executed, and no generation requests or tests were run. The review was based on source, Git history, current working trees, the supplied screenshot, and official documentation.

## Objective

Build a fresh React/TypeScript Photopea plugin that follows the Photoshop plugin's Astria composer design, with explicit application state and a dedicated Photopea host adapter.

The proposed first release focuses on image generation and editing. Direct Gemini, layered compositions, video handoff, and agent features are later milestones. These scope choices are recommendations from the review, not separately confirmed user decisions.

## Repositories and reviewed references

- Target: `/Users/burg/git/photopea-nano-banana`
- Photoshop reference: `/Users/burg/git/nano-banana-photoshop-uxp`
- Backend reference: `/Users/burg/git/sdbooth`
- Screenshot supplied by user: `/var/folders/95/fkgm78nn7h792chv4mkjls2h0000gn/T/codex-clipboard-0ab9dccf-5b98-4441-b93d-f6004dfdea53.png`

The screenshot is a temporary local file and may not survive until implementation. The design description below captures its essential structure.

Relevant Photoshop files:

- `docs/react-ui-rewrite-plan.md`
- `docs/architecture.md`
- `docs/code-review.md`
- `README.md`, especially UI conventions and manual validation
- `nano-banana/package.json`
- `nano-banana/ui-src/src/App.tsx`
- `nano-banana/ui-src/src/components/ui/`
- `nano-banana/ui-src/src/lib/`
- `nano-banana/ui-src/src/styles.css`
- `nano-banana/webviewBridge.js`
- `nano-banana/astriaSdk.js`
- `nano-banana/main.js`

The initial Photoshop UI rewrite is commit `793874ac` (`Replace the Spectrum panel with a React webview UI`). Later changes add separate model options, progress, workspaces, history stars, references, and video/agent functionality. Review the current source before porting; the repository had substantial uncommitted work during this review.

Photopea had one pre-existing change in `imageUtil.js`: removal of its opening comment. Preserve it. Recheck both working trees before implementation; this document is a dated snapshot.

## Findings that shape the rewrite

### Photoshop provides the visual foundation

The reviewed implementation uses React 18, TypeScript, Radix primitives, locally owned shadcn-style components, Tailwind 3, and Vite. Useful reusable pieces include:

- Astria color tokens, logo, provider icons, typography, and spacing.
- Buttons, dialogs, tooltips, dropdowns, and popovers.
- Searchable model/count/resolution/quality pills.
- Reference thumbnails and add-image controls.
- Recent/starred prompt history and account/workspace menus.
- Inline generation stages, errors, and completion states.
- Pure option, history, progress, and geometry logic where host assumptions can be removed.

The current Photoshop architecture remains transitional. The React WebView exchanges messages with a UXP bridge that derives state from hidden legacy controls. Much of its UI is concentrated in `App.tsx`. Photopea should use a fresh state model and smaller feature components.

The Photoshop `plugin:` URL scheme, classic-script output conversion, UXP secure storage, hidden Spectrum DOM, Adobe permissions, and CCX packaging are host-specific. They should not become Photopea dependencies.

### Photopea needs a new host integration

The current app uses static HTML, CDN Tailwind/DaisyUI, shared globals, Axios, and Fabric for crop/resize. Models are hardcoded. It captures the document composite, crops to selection bounds or the full canvas, submits one job, and places the first returned image.

Observed source issues to address in the new implementation:

- `photopeaContext.js` leaves message listeners installed after timeout and does not clear its timeout after success.
- Its placement loop sets `invokeInProgress` without resetting it after an unsuccessful completion check, so insertion can stall indefinitely.
- Placement is based on the active document and layer count instead of a robust captured destination identity.
- The current resize path stretches a result to the requested rectangle.
- Authentication installs request interceptors repeatedly; removing the stored key does not remove those interceptors.
- Generation cleanup is commented out. Do not assume Photoshop's deletion behavior is Photopea's existing retention contract.

These are source findings, not runtime reproductions.

## Proposed product scope

### First release

- Validated Astria API-key login, sign-out, account details, balance, and workspace billing.
- Dynamic model catalog with capability-driven controls.
- Model, count, resolution, quality, and modifiers where supported.
- Multiline prompt, clear action, and Cmd/Ctrl+Enter submission.
- File references, drag-and-drop, thumbnail previews, removal, and current-layer references.
- Recent/starred prompt history with reuse, individual removal, and clear behavior.
- Selection editing and whole-canvas editing.
- Multiple returned images and automatic placement as new layers/smart objects.
- Generation stages, actionable errors, cancellation semantics, and placement recovery.
- Foreground-color input and preservation/prompt-only Generate choice where applicable.

### Later milestones

- Direct Gemini credentials and provider adapter.
- Layered composition manifests and grouped placement.
- Create video handoff to Astria.
- Agent chat and Photopea tools.
- Durable result archives or conversational image-edit history.

Hide unsupported catalog entries based on capabilities. Do not expose controls that imply working integrations before those integrations are validated.

### Preserve the no-selection behavior

The current Photopea plugin edits the whole canvas when there is no selection. The current Photoshop plugin instead performs text-to-image generation in that situation.

**Recommendation: preserve whole-canvas editing in Photopea.** A future create-new-image mode should be explicit. Do not silently change this behavior while copying Photoshop code.

With no open document, show an actionable state asking the user to open or create a document before generating.

## Visual specification

Use the supplied screenshot as the reference for a compact Astria image composer:

```text
Astria Photopea       History   Workspace   Account
┌───────────────────────────────────────────────┐
│ [Reference] [Reference] [Add image]       Clear │
│                                               │
│ Describe the image you want to create…         │
│                                               │
│ Generation status / actionable errors          │
│ Model ▾  Count ▾  Resolution ▾  Options     ↑ ▾ │
└───────────────────────────────────────────────┘
Account · Balance                    ⌘/Ctrl ↵
```

The video button shown in the screenshot belongs to the later video milestone.

| Token | Baseline |
| --- | --- |
| Background | `#161616` |
| Composer | `#232323` |
| Border | `#454545` |
| Primary text | `#F5F5F5` |
| Secondary text | `#B4B4B4` |
| Focus/accent | Existing Photoshop blue-violet token |
| Typography | System sans-serif; 14px prompt; compact 12–13px controls |
| Shape | 18px composer radius; pill selectors; compact thumbnail tiles |

Use the Photoshop UI source as the token baseline, rather than estimating dimensions from a potentially high-DPI screenshot. Keep the composer as the primary surface and reserve strong contrast for Generate.

Responsive requirements:

- Exercise narrow widths around 240, 320, and 400 CSS pixels, plus larger floating panels.
- Exercise short heights; Generate and essential controls must remain reachable.
- Let the prompt absorb spare height; use deliberate overflow behavior at very small sizes.
- Wrap option pills and truncate long labels without losing their accessible names.
- Constrain popovers to the iframe viewport with collision handling.
- Preserve visible focus, Escape behavior, focus return, and accessible labels.
- Enter inserts a newline; Cmd/Ctrl+Enter generates; IME composition must not submit.
- Respect reduced motion. Define light-theme tokens, but verify how Photopea theme selection can be obtained before promising automatic synchronization.
- Audit the custom searchable select's combobox/listbox relationships and keyboard behavior during extraction. Radix primitives alone do not validate custom option-panel accessibility.

## Proposed architecture

```text
React components
      │
Application state + generation controller
      ├── Domain helpers: capabilities, requests, geometry, history
      ├── Astria service: catalog, account, jobs, polling, results
      ├── Storage: credentials, preferences, history
      └── Photopea adapter: queue, capture, selection, placement
                              │
                     Parent-frame messaging
```

Suggested layout:

```text
src/
  app/                  # Bootstrap, providers, application state
  components/ui/        # Owned shadcn/Radix primitives
  features/composer/    # Prompt, references, options, Generate
  features/account/     # Authentication, workspace, balance
  features/history/     # Recent/starred prompts
  features/generation/  # Controller, lifecycle, recovery UI
  domain/               # Pure types, capabilities, request/geometry logic
  services/astria/       # HTTP client and backend contracts
  host/photopea/        # Transport, scripts, capture, placement
  storage/              # Versioned persistence and migration
  styles/
```

React owns UI state. Components call typed services; only the Photopea adapter emits host scripts. Keep host-executed scripts in a separately identifiable module because their supported JavaScript and APIs differ from browser code.

Start by extracting a small, reviewed set of UI components into this repository. Avoid making the initial rewrite depend on simultaneous changes to Photoshop or introducing a shared cross-repository package. Record copied source provenance so a shared package can be considered later.

Use Vite with normal browser modules, compiled Tailwind, bundled dependencies, and native browser image decoding/canvas for crop/resize. Keep extracted UI dependencies compatible with the source implementation initially; select and lock supported build-tool versions when scaffolding. A framework-major upgrade is a separate decision from this rewrite.

## Photopea adapter requirements

Proposed typed operations:

- Inspect document and host capabilities.
- Capture composite and selection metadata as one serialized operation.
- Capture the active layer as a reference.
- Read foreground color.
- Place generated results against a captured destination.
- Restore selection and clean temporary document/layer state.

### Transport

- One command queue with only one active host operation.
- Validate message source and the configured parent origin.
- Use request markers in scripted responses; associate binary exports with the active operation.
- Handle startup and operation `done` messages explicitly.
- Bound all waits and clear timers/listeners on success, failure, teardown, and timeout.
- After a timeout, enter recovery and verify a fresh handshake before accepting another operation. Late output must not satisfy a subsequent request.
- Fail clearly when opened outside Photopea; allow a separate fixture-driven UI development mode.
- Serialize script arguments safely; do not interpolate arbitrary prompt text into executable code.

Photopea's documented transport does not provide native request IDs. Strings, ArrayBuffers, and `done` acknowledgements require an application-level protocol around the native interface.

### Capture and placement

- Keep original selection bounds, capture bounds, and destination geometry separate.
- Preserve selection shape and alpha, not merely its rectangular bounds.
- Maintain aspect ratio and handle model-specific pixel/resolution limits separately.
- Retain a reliable destination identity and validate it before mutation. Do not identify a document solely by its display name or overwrite its existing `source` metadata casually.
- Re-select the captured destination when safe. If it was closed or cannot be identified, retain results and offer recovery instead of placing into another document.
- Verify smart-object insertion completion and the inserted layer itself; avoid an unbounded layer-count polling loop.
- Establish accurate placement and mask restoration before adding expanded-context capture.
- Use `finally` cleanup for temporary visibility changes, layers, selections, buffers, and object URLs.
- Define partial-placement behavior and avoid duplicate layers when retrying completed results.

Document identity, irregular selection capture, masks, asynchronous insertion, and undo grouping are early runtime validation gates. Do not assume the Photoshop UXP implementation can be translated directly.

## Generation lifecycle

Suggested stages:

```text
idle → capturing → submitting → generating → downloading → placing → succeeded
                                      └──────── failures / cancellation ───────┘
```

At submission, snapshot the prompt, model/options, workspace, references, destination, and geometry. Disable conflicting actions or ensure later UI changes cannot alter that job.

- Only one generation job at a time in the first release.
- Distinguish generation success from placement success.
- Retain completed result data when placement fails; offer placement retry or download without charging for another generation.
- Explain cancellation honestly: stopping local waiting does not necessarily cancel server work or billing.
- Do not automatically retry a potentially accepted paid submission unless the backend provides a verified idempotency contract.
- Use model timing/timeout data where available, with bounded polling and actionable errors.
- Refresh balance without masking the primary job result if the refresh fails.
- Track created prompt/reference IDs immediately so cleanup decisions remain possible after partial failures.

Durable retention across a browser reload is outside the proposed first release unless separately designed. In-memory recovery must not be presented as permanent storage.

## Backend, authentication, and storage

### Catalog

The reviewed backend's current catalog is `GET /plugin/models`, implemented in `sdbooth/app/controllers/plugin_controller.rb`. It supplies stable model keys, capability fields, defaults, options, and timing information. `/plugin/tunes` is the older contract.

Use catalog metadata to determine prompt requirements, references, masks, image count, resolutions, quality, and provider support. Avoid title-based behavior and hardcoded tune IDs. Validate response shape and show a recoverable initialization error on incompatible or unavailable data.

### Accounts and workspaces

- Centralize API calls and create authorization headers per request.
- Validate credentials before marking the account ready.
- Clear stored and in-memory credentials on sign-out.
- Migrate the existing `astriaApiKey` storage key with a versioned migration.
- Handle unavailable or partitioned iframe storage gracefully; do not claim browser storage is equivalent to UXP secure storage.
- Keep credentials out of URLs, logs, fixtures, and source.
- Snapshot workspace selection for each job and send the workspace header on all relevant billed requests.
- Display the returned payer's balance and preserve workspace billing error details.
- Specify account/workspace change behavior while jobs are active.

### Browser integration

- Preserve the production plugin URL: `https://astriaai.github.io/photopea-nano-banana/`.
- Use Photopea attribution and a Photopea build version.
- Do not show Photoshop CCX update links or rely on Photoshop user-agent parsing for Photopea feature eligibility.
- The local backend CORS configuration reviewed allows `https://astriaai.github.io` and `https://localhost:4443`. Verify deployed API behavior, authorization/workspace preflights, and image-CDN CORS in the browser.
- Configure HTTPS local development on the already permitted origin/port where practical.
- Use normal browser navigation for external links; account for popup restrictions if a later async video handoff opens a new tab.

### Retention

The current Photopea plugin leaves remote results in place because its deletion code is disabled. Establish the intended retention policy before introducing deletion. Delete only resources explicitly created and owned by the current job, and only under an agreed policy; never delete catalog/base models or unrelated tunes.

## Implementation sequence after authorization

| Milestone | Deliverable | Acceptance gate |
| --- | --- | --- |
| 1. Host prototype | New transport, composite capture, destination tracking, fixture placement | Correctly capture and place a fixture in real Photopea without a generation API call; timeout recovery works |
| 2. UI foundation | Vite/React/TypeScript scaffold, owned components, screenshot-matched shell | Menus, focus, narrow/short layouts, references, and fixture-driven states work |
| 3. Account and catalog | Credential migration, login, dynamic models, workspace/payer state | Correct initialization, supported controls, auth failures, and billing context |
| 4. Generation | References, request construction, polling, download, placement, recovery | Complete edit flow; multiple results; no wrong-document placement or repeat charge on placement retry |
| 5. Release preparation | Focused tests, real-host validation, preview build, deployment/rollback procedure | Acceptance matrix passes and a concrete release is reviewable |

The first implementation deliverable should combine the capture-and-placement prototype with the screenshot-matched composer shell. Connect paid generation only after those foundations are verified.

## Verification plan

Meaningful automated tests:

- Message ordering, startup acknowledgements, timeout cleanup, late responses, and recovery.
- Catalog normalization and capability-driven request construction.
- Geometry, aspect-ratio preservation, selection/capture coordinate mapping.
- Workspace snapshots and request headers.
- Cancellation and partial failure transitions.
- Placement retry behavior and result retention without resubmission.
- Credential migration and storage failure handling.
- History recency, stars, and removal.

Browser interaction checks:

- Authentication and initialization states with fixtures.
- Searchable selectors, Escape, arrow navigation, focus return, and accessible names.
- References, long prompts/model names, history actions, and disabled states.
- Narrow/short panels, zoom/high DPI, and light/dark token behavior.
- Cmd/Ctrl+Enter and IME handling.

Real Photopea checks:

- No open document; no selection; rectangular and irregular selections.
- Nested/hidden layers and active-layer references.
- Transparent images, differing output ratios, large documents, and multiple outputs.
- Document switching, closure, and changes during generation.
- Host timeout, network failure, authorization failure, insufficient balance, and placement failure.
- Selection restoration, temporary-state cleanup, and supported undo behavior.
- Browser storage and CORS from the production-like iframe origin.

Use local fixture images before paid generation tests. Browser-preview success does not establish Photopea host correctness. Record actual tested browsers and Photopea behavior rather than claiming universal support.

## Rollout proposal

Build at a separate preview path while the existing production entry remains available. Keep the current production origin and URL for the eventual cutover so installed plugin entries remain valid.

- Configure Vite asset paths for the GitHub Pages repository subpath.
- Prepare a reproducible build and deployment workflow.
- Use versioned assets and a documented rollback to the prior build.
- Preserve existing credentials and preferences through versioned migrations.
- Recheck the repository's current hosting mechanism before designing the final workflow; remote Pages settings were not inspected in this task.
- Deployment, commits, and implementation are not performed by this handoff.

## Open decisions and capability gates

These should be resolved during implementation planning or early prototypes, not treated as existing guarantees:

1. Confirm the proposed first-release scope and later feature milestones.
2. Confirm preservation of whole-canvas edit behavior without a selection.
3. Prove reliable destination identity, mask restoration, insertion completion, and undo behavior in Photopea.
4. Decide remote-result retention before enabling cleanup.
5. Define Photopea-specific backend version/feature attribution if needed.
6. Determine supported browsers and theme synchronization behavior.

No user answer is needed merely to retain this document. The next action requires a user instruction to begin implementation.

## Git discipline for future work

Follow current repository/user instructions at execution time. Instructions supplied for this task were:

- Commit only task-owned files.
- Use one atomic explicit-path commit: `git commit -m "<message>" -- <file-1> <file-2> ...`.
- Do not stage tracked files with `git add`; new task-owned files may be added explicitly before committing.
- Never amend, reset, stash, or discard unrelated changes.
- If another task changes the index or branch, inspect the new state and retry safely.

## Official references checked

- [Photopea plugins](https://www.photopea.com/api/plugins): iframe plugin model, flexible sizing, publishing, and stable URLs.
- [Photopea live messaging](https://www.photopea.com/api/live): script/binary transport and `done` acknowledgements.
- [Photopea scripting](https://www.photopea.com/learn/scripts): document model, exports, `echoToOE`, and smart-object opening.
- [shadcn/ui](https://ui.shadcn.com/docs): locally owned component code and composition.
- [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility): primitive behavior, keyboard support, and labeling responsibilities.
- [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide): consult if changing major versions from the Photoshop UI baseline.
