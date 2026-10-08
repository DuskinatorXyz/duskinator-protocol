# Roadmap

Phases are ordered by dependency, not by calendar. A phase is finished when its exit criteria are met and written up in a release note.

## Phase 1: read-only desk

Goal: show real Solana data with its sources.

- Live chain and market feeds in the reference interface
- A transaction tracer
- An address check that compares a pasted string with the project's published contract, once one exists

Exit: every number on screen cites its source and shows a loading or offline state instead of a blank.

## Phase 2: rate records

Goal: define the normalised record and publish the schema.

- Record format for asset, tenor, base rate, incentive rate, depth and source
- A first set of venue adapters, each marked unverified
- Replay tests that recompute a rate from cited accounts

Exit: independent reviewers can reproduce a published rate from the schema alone.

## Phase 3: curve and quotes

Goal: one comparable curve per asset.

- Aggregation across adapters, with stale and unverified flags
- A quote view that lists each source behind a figure
- Public documentation of the normalisation rules

Exit: the quote view matches a hand calculation for a sample of venues chosen by reviewers.

## Phase 4: policy and routing

Goal: propose allocations that respect depositor limits.

- Policy format and validation
- An allocation solver that explains which bound blocked a result
- Transaction construction for the depositor to sign

Exit: a security review of transaction construction with all high findings resolved.

## Phase 5: review process

Goal: let adapters earn trust in the open.

- A written review checklist
- Tooling for reviewers to compare adapter output with chain state
- Rules for bonds, stakes and disputes as described in the tokenomics draft

Exit: at least one adapter moves from unverified to reviewed through the published process.

## Not planned

- Custody of depositor funds
- Leverage or looping strategies
- Promises of fixed returns
