# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use the repository's private vulnerability reporting (the **Security** tab, then **Report a vulnerability**). If that is not available, open an issue asking for a private channel and include no details.

A useful report contains:

- what you found and where
- steps to reproduce it
- what an attacker could do with it
- any suggested fix

## What to expect

- An acknowledgement that the report arrived.
- A follow-up with our assessment and, where it applies, a plan.
- Credit in the release note if you want it.

We ask that you give us a reasonable chance to fix a problem before sharing it more widely, and that you avoid testing against other people's funds or accounts.

## Scope

In scope:

- the static interface in this repository
- the build and check scripts
- the design documents, where a flaw could mislead users into losing funds

Out of scope:

- third-party services the interface reads from
- findings that need a compromised device or browser
- reports of missing headers with no demonstrated impact

## Impersonation warning

This project has not launched a token, and no contract address has been published. Be sceptical of any account, message or site that claims otherwise. The address check in the interface will say plainly when no contract has been published.

## Supported versions

The project is at the design stage. Only the latest state of the main branch receives fixes.
