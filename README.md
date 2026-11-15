# Open Advocate

One desktop agentic harness for Indian litigation, before every court and tribunal. The advocate gives an instruction, the agent does the work through litigation skills, and the advocate decides every legal point. What it is and what it is not is in [docs/product.md](docs/product.md).

The code today takes a Supreme Court matter from the impugned judgment to a verified filing set for a Special Leave Petition. The plan that widens it to every proceeding is in [docs/build-plan.md](docs/build-plan.md).

What the advocate does and sees is in [docs/advocate-workflow.md](docs/advocate-workflow.md). The documents are listed, in reading order, in [docs/README.md](docs/README.md).

## Run it

Node 22.19 or later. The vendored parts are not in the repository; each has its own script.

```bash
npm install
npm run vendor
npm run vendor:ulos
npm run vendor:voice
npm run vendor:ocr
npm run vendor:extensions
npm run build
npm start
```

`npm run vendor` fetches the official Euro-Office release ([docs/engineering.md](docs/engineering.md) section 2). `npm run vendor:ulos` copies the citation validator. `npm run vendor:voice` fetches the speech model. `npm run vendor:ocr` fetches the second OCR engine's models. `npm run vendor:extensions` installs the bundled Pi extensions ([docs/harness-hardening.md](docs/harness-hardening.md)).

The agent uses the model credentials that Pi already stores for the user ([docs/engineering.md](docs/engineering.md), choice EC-6).

## Build a folder to install

```bash
npm run dist
```

The result is `release/<platform>-unpacked/`, with the vendored parts inside it. On Windows, start `Open Advocate.exe`. The build is not code-signed.

## Test

```bash
npm run typecheck
npm run test:unit
npm run build
npx playwright test
```

The tests that need a live model run only when `OPENADVO_LIVE_MODEL` names one. The tests that reach AWS Open Data, India Code and the web run only when `OPENADVO_LIVE_NET=1`. The smoke test of the installed build runs only after `npm run dist`.

## Where things are

The folders and the data outside the repository are in [docs/repo-map.md](docs/repo-map.md). The phases and the features are in [docs/build-plan.md](docs/build-plan.md) and [docs/features.md](docs/features.md). What the earlier rounds built is in [docs/archive/2026-11-15/build-plan.md](docs/archive/2026-11-15/build-plan.md). The standing orders for agents that work on this repository are in [AGENTS.md](AGENTS.md).
