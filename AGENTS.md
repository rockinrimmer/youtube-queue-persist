# Project instructions

- Always use British English.
- This is a WXT extension targeting Firefox Manifest V3, using vanilla TypeScript.
- Keep undocumented YouTube page integration in `lib/youtube.ts`.
- Never replace a saved queue with an empty, partial, or failed restore result.
- Keep permissions limited to extension storage and `https://www.youtube.com/*`.
- Use pnpm for dependency management and project scripts.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build` after functional changes.
