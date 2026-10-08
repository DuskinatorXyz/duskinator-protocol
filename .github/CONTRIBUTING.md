# Contributing

Thanks for taking an interest. This project is at the design stage, so the most useful contributions are careful reading and specific feedback.

## Ways to help

- **Review the documents.** Point out unclear definitions, missing failure cases and assumptions that should be stated.
- **Check the numbers.** If a figure in the interface looks wrong, open an issue with the source you compared it against.
- **Propose adapters.** Describe the venue, the accounts that carry its rate and how its rate is defined.
- **Improve the interface.** Accessibility, mobile behaviour and loading states are all welcome.

## Before you open a change

1. Open an issue first for anything larger than a typo, so effort is not wasted.
2. Keep each change focused on one thing.
3. Run the checks locally:

   ```bash
   npm run build
   npm run gates
   ```

   Both must exit with code 0.

## Style

- Write plain, specific prose. Say what a thing does and where it fails.
- Do not add colour values outside the tokens file; the palette is defined once.
- Every external fact lives in one register record with its state and source.
- Do not add tracking, analytics or wallet connection code.

## Reviews

A maintainer will reply with questions or a decision. Disagreement is fine; please keep it about the work.

## Conduct

Be respectful. Assume good faith. Harassment of any kind ends a discussion and may end participation.

## Licence

By contributing, you agree that your work is released under the MIT licence in this repository.
