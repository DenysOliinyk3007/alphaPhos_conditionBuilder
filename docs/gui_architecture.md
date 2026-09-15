# alphaPhos GUI — architecture draft

*Status: draft v0.1, 2026-09-13. Owner: Denys Oliinyk.*

The alphaPhos GUI is a browser front-end shipped **inside the alphaPhos
package** that walks a user through the library's pipeline step by step:
conditions → import & collapse → QC → preprocess → analysis → export.
It is a thin shell over the public Python API. It never re-implements
science; every GUI action maps to a documented `ap.*` call and emits the
corresponding Python code.

The **Conditions** page (sample table + 96-well plate builder) is the first
page to be built and is the only page that also works with no Python
server at all.

---

## Contents

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [Guiding principles](#2-guiding-principles)
3. [System overview](#3-system-overview)
4. [Launch and process model](#4-launch-and-process-model)
5. [Repository layout](#5-repository-layout)
6. [Frontend architecture](#6-frontend-architecture)
7. [Backend architecture](#7-backend-architecture)
8. [Project file and directory](#8-project-file-and-directory)
9. [API contract](#9-api-contract)
10. [Page specifications](#10-page-specifications)
11. [Code generation](#11-code-generation)
12. [Validation and error model](#12-validation-and-error-model)
13. [Packaging and distribution](#13-packaging-and-distribution)
14. [Testing strategy](#14-testing-strategy)
15. [Security](#15-security)
16. [Roadmap](#16-roadmap)
17. [Open decisions](#17-open-decisions)

---

## 1. Goals and non-goals

**Goals**

- Let a wet-lab user run the standard alphaPhos workflows (Workflows A–D in
  *How to use alphaPhos*) without writing Python.
- Produce, for every session, a reproducible `pipeline.py` that gives the
  same result as the clicks did.
- Keep the library the single source of truth for defaults, validation and
  provenance. The GUI reads defaults from the library, never duplicates them.
- Ship with `pip install alphaphos[gui]`; launch with one command; no
  Node.js, no build step, no internet access required at runtime.
- Work on instrument PCs and laptops with multi-GB search-engine reports.

**Non-goals (v1)**

- Multi-user or remote deployment. The server binds to localhost only.
- Replacing notebooks for exploratory analysis. Power users keep the API.
- Custom plotting beyond what `ap.qc` already produces.
- Editing the AnnData by hand (cell-level edits). The GUI works at the
  level of pipeline steps and their settings.

## 2. Guiding principles

1. **Thin GUI, thick library.** If a page needs logic that is not in the
   library, the logic goes into the library first (as public API), then the
   page calls it. Sample-name extraction, condition validation and recipe
   generation are library functions with GUI callers.
2. **Every click produces code.** Each page renders the Python that
   reproduces its current state. The whole session is exported as
   `pipeline.py`. Code generation lives in Python (`alphaphos.gui.codegen`)
   so it is unit-tested against real signatures.
3. **The project file is the spine.** All page state lives in one JSON
   document (`project.alphaphos.json`). Pages read and write it; nothing
   else carries state between pages. Reopening a project restores the GUI.
4. **Stages persist to disk.** Every heavy step writes an `.h5ad` into the
   project directory. Pages re-open instantly; nothing is recomputed unless
   settings changed (settings hash stored alongside).
5. **Offline where cheap, server where necessary.** The Conditions page
   runs from `file://`. Everything that touches pandas or AnnData needs the
   local server. Pages declare `needsServer` and degrade gracefully.
6. **No build step.** Vanilla ES modules and CSS are the source of truth.
   The repo stays free of Node tooling except `node --test` for pure JS
   units.
7. **Progressive disclosure.** Each page shows the library defaults, a
   one-line rationale (pulled from the design principles doc), and an
   "Advanced" section that mirrors the `advanced=` dict of the call.

## 3. System overview

```
┌──────────────────────────────┐        HTTP + SSE (127.0.0.1:port, token)
│  Browser SPA (vanilla ESM)   │◀──────────────────────────────────────┐
│  router · store · pages      │                                        │
│  offline-capable: Conditions │                                        ▼
└──────────────┬───────────────┘                        ┌────────────────────────────┐
               │ localStorage (offline autosave)        │  alphaphos.gui.server      │
               ▼                                        │  FastAPI + uvicorn         │
        project draft                                   │  routers: project, files,  │
                                                        │  conditions, collapse, qc, │
                                                        │  preprocess, stats,        │
                                                        │  enrichment, export, jobs  │
                                                        └──────────┬─────────────────┘
                                                                   │ in-process calls
                                                                   ▼
                                                        ┌────────────────────────────┐
                                                        │  alphaphos library         │
                                                        │  io · preprocess · qc ·    │
                                                        │  stats · enrichment · …    │
                                                        └──────────┬─────────────────┘
                                                                   │ read / write
                                                                   ▼
                                                        ┌────────────────────────────┐
                                                        │  Project directory         │
                                                        │  project.alphaphos.json    │
                                                        │  conditions.tsv            │
                                                        │  derived/*.h5ad            │
                                                        │  results/ · reports/       │
                                                        │  pipeline.py               │
                                                        └────────────────────────────┘
```

Files are always addressed **by path**, never uploaded: the server runs on
the same machine as the browser and the data. This is what makes multi-GB
Spectronaut reports and parquet exports workable.

## 4. Launch and process model

| Mode | Command | Server | Pages available |
|---|---|---|---|
| CLI | `alphaphos gui [--port 8765] [--project DIR] [--no-browser]` | yes | all |
| Python / Jupyter | `ap.gui.launch(project=None, port=None, open_browser=True)` | yes, background thread | all |
| Static | open `src/alphaphos/gui/static/index.html` | no | Conditions only |

On launch the server picks a free port, generates a random session token,
binds to `127.0.0.1`, and opens `http://127.0.0.1:<port>/?token=…`. The
token is required on every `/api/*` call (see §15).

Long-running steps (collapse, imputation, DE) run as **jobs** in a worker
thread. The browser follows progress through Server-Sent Events. The
server holds exactly **one workspace** at a time (one open project, one
in-memory `AnnData`).

## 5. Repository layout

```
src/alphaphos/
  cli.py                      # `alphaphos` entry point; `gui` subcommand
  gui/
    __init__.py               # launch()
    server.py                 # FastAPI app factory, static mount, token middleware
    workspace.py              # Workspace: open project, in-memory adata, stage cache
    jobs.py                   # JobManager: thread pool, progress, log capture, SSE
    codegen.py                # project → pipeline.py (per-step templates)
    schema.py                 # pydantic models: Project, per-step settings, API bodies
    routers/
      project.py  files.py  conditions.py  collapse.py  qc.py
      preprocess.py  stats.py  enrichment.py  export.py  jobs.py
    static/
      index.html
      css/tokens.css  base.css  components.css
      js/
        app.js                # boot: detect server, load project, mount router
        router.js  store.js  api.js
        components/           # file-picker, data-grid, plate-grid, validation-panel,
                              # stepper, code-drawer, job-monitor, toast
        pages/
          conditions/  index.js  samples.js  table.js  plate.js  export.js  rules.js
          collapse/    qc/    preprocess/    analysis/    export/
        lib/                  # pure functions: tsv-stream.js, well-id.js, validate.js
tests/
  gui/
    test_server.py  test_conditions_api.py  test_codegen.py  test_files.py
    js/  *.test.js            # run with `node --test tests/gui/js`
docs/design/gui_architecture.md   # this document
```

Hatch already ships everything under `src/alphaphos`, so `static/` is
included in the wheel with no extra configuration.

## 6. Frontend architecture

### 6.1 Boot sequence

1. `app.js` reads `?token=` and calls `GET /api/health`. Success → online
   mode, capabilities from the response (installed extras). Failure →
   offline mode.
2. Load project: online → `GET /api/project`; offline → localStorage draft.
3. Mount the stepper (one entry per page) and route to the first page
   whose `requires` are unmet, or to the last visited page.

### 6.2 Page contract

Every page is an ES module exporting one object:

```js
export default {
  id: 'conditions',
  title: 'Conditions',
  step: 1,
  needsServer: false,           // page mounts in offline mode
  requires: [],                 // project paths that must exist, e.g. ['collapse.output']
  provides: ['conditions'],     // project paths this page writes
  mount(root, ctx) {},          // ctx = { store, api, router, toast, caps }
  unmount() {},
};
```

Pages never talk to each other; they communicate only through the store.
`requires` drives stepper state (locked / ready / done). A page whose
`needsServer` is true renders an "start the server" hint in offline mode.

### 6.3 Store

- A single plain object mirroring the project file, wrapped in
  `store.get(path)`, `store.update(fn)`, `store.subscribe(path, fn)`.
- Updates are immutable replacements of the affected subtree so subscribers
  can compare by reference.
- Persistence: debounced 500 ms → `PUT /api/project` (online) and always
  → localStorage (draft, keyed by project path).
- Undo/redo: last 50 snapshots, in memory only.

### 6.4 Shared components

| Component | Used by | Notes |
|---|---|---|
| `file-picker` | all import steps | online: server-side directory browser (`/api/fs/list`); offline: `<input type=file>` + drag-drop |
| `data-grid` | Conditions table, results tables | virtualised rows, editable cells, multi-select, sort, filter, column add/remove |
| `plate-grid` | Conditions plate | 8×12 (parameterised for 16×24), paint/drag, row/col select, legend |
| `validation-panel` | every page | list of `{level, code, message, hint, target}` from §12 |
| `settings-form` | Collapse, Preprocess, Analysis | generated from a JSON schema served by the backend (`/api/schema/<step>`) so defaults come from the library |
| `code-drawer` | every page | shows the page's snippet from `/api/codegen/<step>`; offline Conditions uses a 2-line JS template |
| `job-monitor` | heavy steps | progress bar + live log via SSE, cancel button |
| `stepper` | shell | pipeline steps with locked/ready/done states |

### 6.5 Design

Tokens in `tokens.css` (colour, spacing, radius, type scale), light and dark
via `prefers-color-scheme`, keyboard-navigable grids, 16 px minimum side
gutter, no horizontal page scroll. No external fonts or CDNs.

## 7. Backend architecture

### 7.1 App factory

`create_app(workspace, token) -> FastAPI`. Mounts `static/` at `/`,
routers at `/api/*`, token middleware on `/api/*`. Uvicorn runs in the
main thread (CLI) or a daemon thread (`launch()`).

### 7.2 Workspace

```python
class Workspace:
    project_dir: Path
    project: Project                # pydantic model of project.alphaphos.json
    adata: ad.AnnData | None        # current stage, in memory
    results: dict[str, pd.DataFrame]

    def open(path) / save() / new(dir, name)
    def load_stage(name) -> AnnData  # from derived/<name>.h5ad
    def store_stage(name, adata, settings)   # writes h5ad + settings hash
    def stage_is_current(name, settings) -> bool
```

The PSM table is **not** kept in memory after collapse; it is re-read from
the report path if a re-collapse is requested.

### 7.3 Jobs

```python
job = jobs.submit(name="collapse", fn=run_collapse, args=..., ws=workspace)
# GET  /api/jobs/{id}          -> {status, progress, message, started, finished, error}
# GET  /api/jobs/{id}/events   -> SSE stream: progress, log, done, error
# POST /api/jobs/{id}/cancel
```

A `logging.Handler` attached to the `alphaphos` logger for the duration of
the job forwards records to the SSE stream, so the library's own warnings
(e.g. "N samples have no entry in condition_df") appear in the GUI log
verbatim. Progress is coarse: stage names from the collapse pipeline
(parse → attribution → keys → aggregate → mask → QC → assemble), since the
library does not expose fine-grained callbacks.

### 7.4 Settings schemas

For each heavy step the backend serves a JSON schema derived from the
library's own defaults dict (e.g. `collapse.DEFAULT_ADVANCED`) plus
per-field metadata (title, help, enum, min/max). The frontend renders
forms from it. Defaults therefore have exactly one home: the library.

## 8. Project file and directory

```
my_study/
  project.alphaphos.json
  conditions.tsv            # exported by the Conditions page; input to collapse
  derived/
    01_collapse.h5ad        # + 01_collapse.settings.json (hash)
    02_preprocess.h5ad
  results/
    de_EGF_vs_ctrl.tsv
    ksea_EGF_vs_ctrl.tsv
  reports/
    qc_dashboard.html
  pipeline.py               # regenerated on every export
```

`project.alphaphos.json` (v1, abridged):

```json
{
  "schema_version": 1,
  "name": "EGF HeLa",
  "created": "2026-09-13T10:00:00Z",
  "alphaphos_version": "0.x",
  "inputs": {
    "report_path": "/data/egf/report.tsv",
    "search_engine": "SN",
    "sample_column": "R.FileName"
  },
  "conditions": {
    "columns": ["sample", "condition", "plate", "well", "batch"],
    "rows": [{"sample": "20240101_HeLa_ctrl_A1", "condition": "ctrl", "plate": "P1", "well": "A1", "batch": "1"}],
    "plates": [{"id": "P1", "format": 96, "wells": {"A1": {"condition": "ctrl", "sample": "…"}}}],
    "palette": {"ctrl": "#7A8CA3", "EGF": "#D9822B"},
    "rules": [{"type": "substring", "pattern": "withEGF", "column": "condition", "value": "EGF"}],
    "exported_to": "conditions.tsv"
  },
  "collapse": {"settings": {"localization_strategy": "condition", "classI_cutoff": 0.75},
               "output": "derived/01_collapse.h5ad", "stats": {}},
  "preprocess": {"filter": {}, "impute": {"method": "hybrid"}, "batch": null,
                 "output": "derived/02_preprocess.h5ad"},
  "analysis": {"design": {"condition_column": "condition", "covariates": ["batch"]},
               "contrasts": {"EGF_vs_ctrl": ["EGF", "ctrl"]},
               "enrichment": {"ksea": {"network": "omnipath", "method": "ulm"}}},
  "ui": {"last_page": "conditions"}
}
```

Rules for the schema: additive changes only within a major version;
`schema_version` bumps come with a migration in `schema.py`; unknown keys
are preserved on round-trip.

## 9. API contract

All responses are JSON except SSE and file downloads. Errors follow §12.

| Method & path | Purpose | Milestone |
|---|---|---|
| `GET /api/health` | version, capabilities `{stats, enrichment, qc, pimms, dimred}` | M0 |
| `GET/PUT /api/project` · `POST /api/project/open` · `POST /api/project/new` | project lifecycle | M0 |
| `GET /api/fs/list?path=` | directory browser, restricted to allowed roots | M0 |
| `POST /api/files/columns` `{path}` | header of TSV/CSV/parquet | M1 |
| `POST /api/files/unique` `{path, column}` | unique values of one column, streamed with pyarrow | M1 |
| `POST /api/conditions/validate` | server-side twin of the JS validator (used by tests and codegen) | M1 |
| `POST /api/conditions/export` `{format}` | writes `conditions.tsv` into the project dir | M1 |
| `GET /api/schema/{step}` | settings JSON schema for `collapse`, `filter`, `impute`, `batch`, `limma` | M2 |
| `POST /api/collapse/run` | job: `read_psm` → `collapse_sites` → `store_stage` | M2 |
| `GET /api/adata/summary` | shape, obs columns, per-sample selectivity, collapse stats | M2 |
| `GET /api/jobs/{id}` · `GET /api/jobs/{id}/events` · `POST /api/jobs/{id}/cancel` | job lifecycle | M2 |
| `POST /api/qc/dashboard` · `GET /api/qc/dashboard.html` | build and serve `generate_dashboard` output for an iframe | M3 |
| `POST /api/recommend` | runs `recommend_pipeline`, returns parsed recipe + proposed settings | M4 |
| `POST /api/preprocess/{filter,impute,batch}` | jobs on the current stage | M4 |
| `GET /api/adata/completeness` | per-condition completeness histogram for the filter preview | M4 |
| `POST /api/stats/{limma,contrasts,anova}` | jobs → results table id | M5 |
| `GET /api/results/{id}?page=&sort=` · `GET /api/results/{id}/download` | paged results, TSV download | M5 |
| `POST /api/enrichment/{ksea,ora,gsea}` | jobs on a results table | M5 |
| `GET /api/codegen/{step}` · `GET /api/codegen/pipeline` | snippet per step; full `pipeline.py` | M1→M6 |
| `POST /api/export/{h5ad,script,bundle}` | write outputs into the project dir | M6 |

## 10. Page specifications

Each page lists: what it reads from the project, what it writes, the
library calls behind it, and the code it emits.

### 10.1 Conditions (M1) — offline-capable

Sub-tabs: **Samples · Table · Plate · Export**.

**Samples**
- Sources: report file (path online / dropped file offline), pasted list,
  existing `conditions.tsv` (edit mode).
- Online: `POST /api/files/columns` then `/api/files/unique`. Handles TSV,
  CSV, parquet (pyarrow), with the column defaulting to `R.FileName`
  (Spectronaut) or `Run` (DIA-NN).
- Offline: streaming parser (`lib/tsv-stream.js`), 16 MB `Blob.slice`
  chunks through `TextDecoder`, keeps only the chosen column's unique
  values. Parquet unsupported offline; UI says so and offers the paste route.
- Writes `inputs.report_path`, `inputs.search_engine`, `inputs.sample_column`,
  and the `sample` column of `conditions.rows`.

**Table**
- `data-grid` with `sample` read-only, `condition` and user columns
  editable, add/remove column, sort, filter, multi-select fill,
  autocomplete from existing values.
- Rule fill: substring or regex on `sample` → set column value; live match
  preview; rules are saved in `conditions.rules` and re-applied on demand.
- Validation (see §12): empty condition, duplicate sample, reserved column
  names (`__condition__`, `__block__`, `__intercept__`), whitespace-only
  values, and a replicate summary with a warning for conditions with n = 1
  (the majority-rule mask is vacuous there).

**Plate**
- `plate-grid`, 96 wells, multiple plates (`conditions.plates`), palette
  with deterministic colours per condition (also stored for reuse in QC
  plots later).
- Paint conditions: click, drag, row/column header select, fill-all.
- Place samples: (a) auto by well-ID suffix using the library regex
  (`_([A-H])(1[0-2]|[1-9])(?:_[^_]+)?$` from `alphaphos.proteome.pairing`),
  (b) drag from the unplaced list, (c) fill sorted samples row-wise or
  column-wise.
- "Apply to table" writes `condition`, `plate`, `well`; edits in the table
  reflect back on the plate. Conflicts (a well painted with a condition
  different from the table) are shown, never silently resolved.

**Export**
- TSV (default) / CSV, blocked while errors exist; online writes
  `conditions.tsv` to the project dir, offline downloads.
- Emits:
  ```python
  cond_df = pd.read_csv("conditions.tsv", sep="\t")
  ```

### 10.2 Import & Collapse (M2)

- Reads `inputs.*`, `conditions`. Settings form from `/api/schema/collapse`
  mirroring `collapse_sites(advanced=…)`: quantification level,
  `localization_strategy`, `classI_cutoff`, `condition_threshold`,
  `aggregation_method`, `precursor_loc_gate`, Wilson threshold, filters.
- Guardrails from the library docs: with `localization_strategy="condition"`
  the conditions table is required; cohorts with n ≥ 100 get a hint to use
  `wilson`.
- Runs job → `derived/01_collapse.h5ad`. Shows shape, layers, collapse
  stats (`adata.uns["alphaphos"]["stats"]`), per-sample
  `phospho_selectivity_pct`, and the condition mask decision summary.
- Emits `psm = ap.read_spectronaut(...)` / `ap.read_diann(...)` and
  `adata = ap.collapse_sites(psm, condition_df=cond_df, advanced={...})`
  with only non-default keys.

### 10.3 QC (M3)

- Builds `ap.generate_dashboard` (Bokeh) and the Plotly panels into
  `reports/`, shown in an iframe. Requires the `qc` extra; otherwise the
  page explains what to install.
- Read-only page; no state except `qc.report_path`.

### 10.4 Preprocess (M4)

- Calls `recommend_pipeline(goal, data_type, primary_factor,
  secondary_factor)` first and offers "apply recommendation" which fills the
  forms.
- Three cards in order: **filter** (`filter_by_completeness`, with a live
  retained-sites preview from `/api/adata/completeness`), **impute**
  (`impute_hybrid` / `impute_knn_site_based` / `impute_pimms`, the last only
  when the extra is present and n ≥ 50), **batch** (`batch_correct_combat`
  or "pass as covariate" which just records it for the analysis page).
- Writes `derived/02_preprocess.h5ad`.

### 10.5 Analysis (M5)

- Design builder on top of `conditions`: condition column, covariates,
  block column; validation mirrors `stats.design` (no NaN, ≥ 2 levels,
  reserved names).
- Modes: two-group `diff_exp_limma`, named contrasts
  `diff_exp_limma_contrasts`, multi-group `diff_exp_anova` + `anova_hits`.
- Results grid (paged from the server), volcano/MA rendered client-side
  from the paged data or via Plotly if the extra is present.
- Enrichment cards on a selected result: KSEA (`enrichment.kinase_activity`),
  site ORA (`enrichment.ora` with `canonicalise_site_ids`), pathway
  (`pathway_enrichment`). Signalome and dimred are out of v1 scope.

### 10.6 Export (M6)

- Writes `pipeline.py`, final `.h5ad`, result TSVs, and a zipped bundle.
- Shows the full generated script with a "copy" button and a diff against
  the last exported version.

## 11. Code generation

- `alphaphos.gui.codegen` holds one template per step, each a function
  `render(project) -> str` that emits only non-default arguments.
- `render_pipeline(project)` concatenates the steps whose outputs exist,
  with imports, the `cond_df` read, and comments naming the GUI page each
  block came from.
- A test executes the generated script on the tiny test fixtures and
  compares `adata.shape` and a checksum of `X` with the GUI-produced stage,
  keeping GUI and script in lock-step.
- The offline Conditions page has the sole client-side template (two
  lines), because it must work without the server.

## 12. Validation and error model

**Validation findings** (both JS and Python produce the same shape):

```json
{"level": "error|warning|info", "code": "COND_EMPTY", "message": "3 samples have no condition",
 "hint": "Fill them in the table or paint them on the plate", "target": {"rows": [4, 9, 11]}}
```

Codes for the Conditions page: `SAMPLE_DUPLICATE`, `COND_EMPTY`,
`COND_WHITESPACE`, `COL_RESERVED`, `COL_NAME_INVALID`, `COND_SINGLETON`
(warning), `SAMPLE_NOT_IN_REPORT` (warning, online only),
`REPORT_SAMPLE_UNLABELLED` (warning, online only: a run in the report has
no row; the library falls back to the strict per-run mask for it).

**API errors** use one envelope:

```json
{"error": {"code": "MISSING_EXTRA", "message": "inmoose is not installed",
           "hint": "pip install 'alphaphos[stats]'", "field": null}}
```

Mapping: `KeyError`/`ValueError` from the library → 400 with the library
message verbatim; `ImportError` → 424 with the extra name; `FileNotFoundError`
→ 404; path outside allowed roots → 403; job failure → job `error` field
with the traceback tail.

## 13. Packaging and distribution

`pyproject.toml` additions:

```toml
[project.optional-dependencies]
gui = ["fastapi>=0.110", "uvicorn>=0.27", "sse-starlette>=2"]
# and the same three lines appended to `all`

[project.scripts]
alphaphos = "alphaphos.cli:main"
```

`static/` ships automatically with the wheel. The sdist excludes nothing
new. The `gui` extra is intentionally small; everything scientific stays
behind the existing extras and is surfaced through `/api/health`
capabilities.

## 14. Testing strategy

| Layer | Tool | What |
|---|---|---|
| JS pure functions | `node --test` (no deps) | `tsv-stream`, `well-id`, `validate`, `rules` |
| API | pytest + `fastapi.testclient` | every router against the tiny fixtures already in `tests/` |
| Codegen | pytest | generated `pipeline.py` executes and matches the GUI stage |
| Schema | pytest | project round-trip preserves unknown keys; migrations |
| Smoke | pytest, optional Playwright marker | launch server, open Conditions, export TSV |

CI runs the JS tests with the Node already available on GitHub runners; no
`package.json` is needed.

## 15. Security

- Bind `127.0.0.1` only; no `--host` flag in v1.
- Random per-launch token in the URL, checked on every `/api/*` request,
  to stop other local web pages from driving the server (DNS rebinding,
  CSRF). Static assets need no token.
- Filesystem access restricted to allowed roots (default: home directory
  and the project directory; `--allow PATH` to add). Paths are resolved and
  checked before any read or write.
- No code execution endpoints: the GUI only calls a fixed set of library
  functions with validated settings. Generated code is written to disk,
  never executed by the server.

## 16. Roadmap

| Milestone | Deliverable | Depends on |
|---|---|---|
| **M0 scaffold** | `alphaphos.gui` package, server + token + health, static shell (router, store, stepper, tokens), CLI, `gui` extra, first pytest | — |
| **M1 Conditions** | full page (§10.1), `/api/files/*`, `/api/conditions/*`, JS tests, codegen for step 1 | M0 |
| **M2 Import & Collapse** | workspace, jobs + SSE, settings schema, collapse page, stage persistence | M1 |
| **M3 QC** | dashboard build + iframe | M2 |
| **M4 Preprocess** | recommend integration, filter/impute/batch cards | M2 |
| **M5 Analysis** | design builder, DE modes, results grid, enrichment cards | M4 |
| **M6 Export** | pipeline.py, bundle, script-parity test | M5 |
| **M7 Notebook widget** (stretch) | `ap.gui.condition_builder(samples)` via anywidget, returns a DataFrame; reuses the Conditions page modules unchanged | M1 |

M1 is usable on its own and is the first release target.

## 17. Open decisions

1. **Name.** "alphaPhos GUI" for now; a product name (e.g. *alphaPhos
   Studio*) can come with M2.
2. **FastAPI vs stdlib.** FastAPI chosen for SSE, pydantic validation and
   testability. Cost: three small dependencies in an optional extra.
3. **384-well plates.** The grid is parameterised; the well-ID regex in the
   library only covers A–H × 1–12. Extending it is a library change first.
4. **Where sample extraction lives.** Proposed as a new public
   `ap.io.list_runs(path, column=None)` so scripts and the GUI share it.
5. **Scope of Analysis.** v1 stops at DE + KSEA/ORA/pathway. Signalome,
   dimred and dose-response are candidates for v2 pages.
6. **Multiple in-memory projects.** v1 holds one workspace per server;
   several projects mean several servers on different ports.
