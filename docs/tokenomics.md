# Tokenomics (draft)

This file defines what a Ratepad token would be for and how its parameters would be decided. **It contains no supply, allocation or price figures on purpose.** Numbers are published only when they are final, with the reasoning attached.

## Roles

| Role | Description |
| --- | --- |
| Adapter bonds | Teams proposing a new venue adapter post a bond. It is returned when the adapter passes review and forfeited if it is found to publish misleading records. |
| Review stakes | Reviewers stake to attest that an adapter reads its venue correctly. Wrong attestations lose stake; correct ones earn a share of fees. |
| Governance | Holders vote on the parameters listed below, never on individual depositor funds. |

## What the token does not do

- It does not custody, lend or pool depositor funds.
- It is not required to read rates or to use the router.
- It carries no promise of income or appreciation.

## Parameters under governance

- review window length and quorum
- bond and stake sizes per adapter class
- fee share between reviewers and the treasury
- the default risk limits shipped in new policies

## Rules for setting parameters

1. Every parameter change is proposed in public with its rationale and the data behind it.
2. Changes that affect bonds or stakes take effect only after a notice period that is stated in the proposal.
3. No change may reach into funds already deposited under an existing policy.
4. Team and treasury holdings, if any exist, must be disclosed with their release conditions before any distribution.

## Distribution principles

- Allocations are published in full, with holders and release conditions, before a distribution happens.
- Early contributors are treated the same as outside participants for release conditions of the same kind.
- No allocation is described as final until it is recorded in a release document in this folder.

## Status

Not launched. No token exists, no contract address has been published and no sale is under way. Any message claiming otherwise is not from this project.
