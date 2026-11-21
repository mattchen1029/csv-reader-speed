# csv-reader-speed — fast drop-in for csv-reader 1.0.0

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/mattchen1029/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/mattchen1029/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0 that answers exactly as it does on every case: the same `{columns, rows, errors}` for broken CSV files (BOM, blank lines, stray CRs, quoted fields with `""`, CR/LF inside quotes, quote junk, unterminated quotes, short/long rows).

## How it is fast

Most records take a fast path: one `indexOf('\n')` per record to find its end, then one `indexOf(',')` per unquoted field and one `indexOf('"')` per quoted field, one `slice` per field — instead of the reference's per-character string building. Quoted fields that span lines are handled in the fast path too. Anything broken (stray CR, quote junk, unterminated quote) falls back to a precise slow parser that follows the reference exactly.

## Run it

```sh
node main.ts
```

Reads `/input/cases.json` (or `$MAKEFUN_INPUT_DIR/cases.json`) and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR/answers.json`).

<sub>Entered on [make.fun](https://make.fun/?ref=r2d6z7t8&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
