# alphaPhos Condition Builder — prototype

Standalone, offline prototype of the first page of the planned alphaPhos GUI
(see `docs/gui_architecture.md`). It builds the `sample` / `condition` table
that `ap.collapse_sites(psm, condition_df=...)` consumes, plus optional
covariate columns for `adata.obs`.

Nothing here touches the alphaPhos repository. When the page is ready it moves
into `alphaphos/gui/static/` as ES modules; the pure libraries in `js/lib/`
are written to port unchanged.

## Run

Open `index.html` in a browser. No server, no build, no dependencies.
State autosaves to localStorage; save a project JSON from the Export tab to
move it between machines.

## Pages

| Tab | What it does |
|---|---|
| Samples | Import run names: search-engine report (TSV/CSV, any size, streamed), queueMaker queue CSV (gives well + rack + blank/QC type), queueMaker plate-layout CSV (paints the layout), an existing conditions table, or pasted names. Paths and `.raw`/`.d` extensions are stripped. |
| Table | Edit conditions and extra columns. Split names into tokens and map varying tokens to columns; rule fill by substring or regex with capture groups; select rows and set a value; auto-number replicates. Checks panel lists what alphaPhos would reject. |
| Plate | Two layers: layout (well → condition, painted) and placement (well → run). Place runs by the `_A1` suffix queueMaker writes, in row/column order, or by drag and drop. Apply the layout to the table or sync it back. |
| Export | `conditions.tsv` (or CSV), the Python snippet, queueMaker layout CSV for the active plate, project JSON save/load. Blocked while errors exist. |

## Try it

`examples/` has the six EGF HeLa runs as DIA-NN paths, a queueMaker Thermo
queue, a plate layout, and a small Spectronaut-style report slice with
`R.Condition` set. The "Load EGF example" button on the Samples tab pastes the
six runs; then on the Table tab press "Split names into tokens" and apply.

## Tests

```
node --test tests/*.test.js
```

Pure-function tests for name handling, CSV/TSV, queueMaker formats and the
validator. No npm install needed.

## Conventions honoured

- Required output columns `sample`, `condition` (alphaphos.constants
  `OBS_SAMPLE`, `OBS_CONDITION`); extra columns are joined into `adata.obs`.
- Reserved column names from `alphaphos.stats.design` are rejected.
- Well-ID regex compatible with `alphaphos.proteome.pairing`, extended for
  queueMaker's `_Q1_A1` and `_QC_A1` forms.
- Blank/QC keyword rules and CSV delimiter/quoting rules identical to
  queueMaker, so layout files round-trip.
