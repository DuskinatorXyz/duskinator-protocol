# Ratepad whitepaper (draft)

## 1. Problem

Yield on Solana is scattered. Each lending market, vault and liquidity pool quotes its own rate, over its own horizon, with its own assumptions about utilisation and incentives. A depositor comparing three venues is comparing three different definitions of "rate".

Three frictions follow:

1. **No common unit.** Variable, boosted and incentive-adjusted rates are quoted side by side without a shared basis.
2. **Stale comparisons.** Rates move with utilisation; a screenshot goes out of date within minutes.
3. **Hidden risk.** A higher rate usually carries thinner depth, a weaker oracle or a younger contract. The number alone hides that.

## 2. Approach

Ratepad separates the problem into two layers.

**Rate discovery.** Adapters read each supported venue directly from chain state. Each adapter converts what it reads into a normalised record: asset, tenor, base rate, incentive rate, available depth and a source reference. Records are combined into one curve per asset.

**Yield routing.** A router takes a deposit and a policy chosen by the depositor, then proposes an allocation across venues. The policy bounds the share per venue, the minimum depth, the venues allowed and the maximum acceptable change in rate before a move is cancelled.

## 3. Principles

- **Non-custodial.** The router never holds funds. It builds transactions that the depositor signs.
- **Reproducible.** Any published rate can be recomputed from the cited accounts.
- **Conservative defaults.** Out of the box, allocations favour depth and simplicity over the last fraction of yield.
- **Boring failure.** When an input is missing or stale, the router declines to act instead of guessing.

## 4. Rate normalisation

Each adapter reports a base rate and an incentive rate separately. The curve exposes both, plus a combined figure that is always labelled as such. Depth is reported at the size the depositor asked about, not as a headline total.

A rate is marked **stale** when its source accounts have not changed within the window set for that adapter, and **unverified** when its adapter has not been reviewed. Neither state is hidden in the interface.

## 5. Routing policy

A policy contains:

- the assets and venues in scope
- a ceiling on the share sent to any one venue
- a floor on depth relative to the deposit
- a tolerance for rate movement between proposal and signing
- an optional rebalance trigger

The router solves for the allocation with the highest combined rate that satisfies every bound. If no allocation satisfies them, it returns no proposal and says which bound failed.

## 6. Open questions

- How should incentive rates that expire be shown against base rates that do not?
- What review process should an adapter pass before its records lose the unverified label?
- Which oracle assumptions should be surfaced per venue, and in what form?

These are listed so that reviewers know where feedback is most useful.

## 7. Limits of this document

This paper describes a design. It makes no promise of returns, availability or timing, and it is not financial advice.
