# Scanix

A live read on where Solana volume gathers.

[![Live site](https://img.shields.io/badge/live-scanix.fun-004bfe)](https://scanix.fun)

- **Chain:** Solana
- **Contract address:** pending

## Overview

Scanix is a single-page market board. It pulls the most promoted tokens from a public aggregator, keeps the Solana ones, resolves each to its deepest pair, and ranks the ten busiest by daily volume. The board refreshes on its own and rests while the tab is out of view.

## Features

- Ranked board with price, daily change, volume and depth for ten Solana pairs
- Tabs to reorder by volume, momentum or depth
- Scrolling ticker fed by the same data
- One-tap copy of every token address
- Retry with growing pauses; the last good board stays on screen if a refresh fails
- Reduced-motion friendly: every animation steps aside on request

## Links

- Site: https://scanix.fun
- X: pending
- GitHub: pending

## Develop

```bash
npm run build   # writes dist/
npm run gates   # builds both contract-address branches and checks the rules
```

`dist/` is the folder to deploy. External facts (contract address, social links, market feed, network) live in `register.json`; a record that is not stated renders as inert.

## License

MIT
