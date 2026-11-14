# Open Advocate

One desktop application for Supreme Court Advocates-on-Record. The advocate gives an instruction, the agent does the work, and the advocate decides every legal point. The application takes a matter from the impugned judgment to a verified filing set for a Special Leave Petition.

What the advocate does and sees is in [docs/advocate-workflow.md](docs/advocate-workflow.md). The documents are listed, in reading order, in [docs/README.md](docs/README.md).

## Run it

Node 22.19 or later. The vendored parts are not in the repository; each has its own script.

```bash
npm install
npm run vendor
npm run vendor:ulos
npm run vendor:voice
npm run build
npm start
```

`npm run vendor` fetches the official Euro-Office release ([docs/euro-office-vendoring.md](docs/euro-office-vendoring.md)). `npm run vendor:ulos` copies the citation validator. `npm run vendor:voice` fetches the speech model.

The agent uses the model credentials that Pi already stores for the user ([docs/questions.md](docs/questions.md), Q-2).

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

The folders and the data outside the repository are in [docs/repo-map.md](docs/repo-map.md). The build order and what each round built are in [docs/build-plan.md](docs/build-plan.md). The standing orders for agents that work on this repository are in [AGENTS.md](AGENTS.md).
