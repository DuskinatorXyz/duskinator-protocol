# Architecture (draft)

## Overview

```
 venues (chain state)
        |
   [ adapters ]  ->  normalised rate records
        |
   [ curve builder ]  ->  one curve per asset, with flags
        |
   [ quote service ]  ->  figures with their sources
        |
   [ router ]  <-  depositor policy
        |
   unsigned transactions  ->  depositor's wallet
```

## Components

### Adapters
One per venue. An adapter reads account data, converts it into a rate record and attaches references to the accounts it used. Adapters have no write access to anything.

### Curve builder
Collects records, drops those whose sources are stale, labels those whose adapter is unreviewed and publishes the result. It never edits a record; it only selects and labels.

### Quote service
Serves the curve and the cited sources to interfaces. It is stateless apart from a short cache and can be run by anyone.

### Router
Takes a deposit and a policy and solves for an allocation. Output is either a proposal with its reasoning or a refusal naming the failed bound.

### Transaction builder
Turns a proposal into unsigned instructions. Signing happens only in the depositor's wallet.

## Data model

A rate record holds:

- asset and tenor
- base rate and incentive rate, kept apart
- depth at a stated size
- references to the source accounts
- an adapter identifier and its review state
- a freshness marker derived from the source accounts

## Trust boundaries

| Boundary | Rule |
| --- | --- |
| Adapter to curve | Records are accepted only with source references that resolve on chain |
| Curve to router | Stale records are excluded, unreviewed ones are flagged in the proposal |
| Router to wallet | Only unsigned transactions cross; the wallet shows what it will do |

## Failure behaviour

- Missing or stale inputs lead to no proposal, with the reason shown.
- A rate that moves past the policy tolerance cancels the move before signing.
- An unreachable data source shows an offline state instead of old numbers presented as new.

## Reference interface

The static site in this repository reads public endpoints straight from the browser. It has no server component, holds no keys and cannot move funds.
