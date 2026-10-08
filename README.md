# Ratepad

Onchain rate discovery and yield routing for Solana.

Ratepad reads lending and liquidity venues, normalises their rates into one comparable curve, and routes deposits toward the best risk-adjusted yield. This repository holds the design documents, the reference interface and the tooling around them.

> **Status: design stage.** The documents in `docs/` describe the intended protocol. Nothing here is deployed, audited or live. Treat every parameter as a proposal until a release says otherwise.

## What it aims to do

- **Discover rates.** Poll supported venues and publish a single, timestamped rate per asset and tenor.
- **Route yield.** Split a deposit across venues according to rate, depth and risk limits set by the depositor.
- **Stay non-custodial.** Funds stay in the depositor's own accounts; the router only proposes and executes transfers the depositor has signed.
- **Show its working.** Every quote lists its sources, so a rate can be checked by hand.

## Documents

| File | Contents |
| --- | --- |
| [docs/whitepaper.md](docs/whitepaper.md) | Problem, design and open questions |
| [docs/architecture.md](docs/architecture.md) | Components and data flow |
| [docs/tokenomics.md](docs/tokenomics.md) | Token roles and the rules for setting parameters |
| [docs/roadmap.md](docs/roadmap.md) | Phases and exit criteria |
| [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) | How to help |
| [.github/SECURITY.md](.github/SECURITY.md) | Reporting a vulnerability |

## Working with the interface

```bash
npm run build   # writes the static site to dist/
npm run gates   # runs the repository checks
npm run serve   # serves dist/ locally
```

Node 20 or newer is required.

## License

MIT. See [LICENSE](LICENSE).
