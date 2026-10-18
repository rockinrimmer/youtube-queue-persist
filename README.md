# YouTube Queue Persist

A Firefox extension built with [WXT](https://wxt.dev/) and TypeScript. It saves YouTube's **native desktop queue** and rebuilds it when you want to continue watching.

Use YouTube's existing **Add to queue** controls. The extension keeps an ordered local copy, the selected video and its playback position. Open the extension popup and select **Restore on YouTube** after closing and reopening a tab.

## Try it in Firefox

Requires Node.js 22 or later, pnpm 10.29.3 and Firefox 142 or later. The pnpm version is pinned in `package.json`; if you use Corepack, run `corepack enable` once to make pnpm available.

```sh
pnpm install
pnpm build
```

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Select **Load Temporary Add-on…**.
3. Choose `.output/firefox-mv3/manifest.json` in this project.
4. Open or reload `https://www.youtube.com/` and grant the YouTube site permission if Firefox asks. Pin **YouTube Queue Persist** to the toolbar for easy access.
5. Add a few videos using YouTube's **Add to queue**. Wait a couple of seconds, then open the extension to see the saved copy.
6. Close the YouTube tab, open YouTube again and select **Restore on YouTube** in the popup. Check the native queue's order and selected video. Restoration seeks to the saved position and pauses the player, although YouTube may briefly begin playback during loading.

On Windows, the manifest is at `D:\Documents\Programming\youtube-queue-persist\.output\firefox-mv3\manifest.json` if you use the current checkout location.

**Temporary add-ons are removed when Firefox exits.** This is enough to test closing and reopening tabs. To keep the extension installed across browser restarts, it needs Mozilla signing, including for private, unlisted distribution. For development, Firefox Developer Edition or Nightly can also install an unsigned XPI with signature enforcement disabled. The ZIP produced by `pnpm zip` is an unsigned package, not an installable signed release for ordinary Firefox. No signing or publishing has been performed.

## Development

```sh
pnpm dev          # WXT development mode, launches Firefox with the extension
pnpm typecheck
pnpm test
pnpm build        # Firefox MV3 production build
pnpm zip          # Package extension and source for signing/distribution
```

`pnpm-lock.yaml` records dependency versions. Use `pnpm install --frozen-lockfile` for a reproducible install. `pnpm-workspace.yaml` allows the esbuild install script and the optional macOS file watcher install script.

GitHub Actions runs `pnpm test` on every push, using Node.js 22 and the pnpm version pinned in `package.json`.

WXT's development browser uses a separate profile. To use your regular Firefox, build and load the manifest manually as above. On WSL, run the build in WSL and load the resulting manifest in Windows Firefox. You can also install dependencies and run WXT directly in Windows with Node.js 22 or later.

There are optional `dev:chrome` and `build:chrome` scripts, but Firefox is the primary target.

## Checks completed

- TypeScript checking and the Firefox MV3 production build pass.
- Eighteen tests cover snapshot retention, backups, repeated videos, native queue detection, incomplete queues, adverts, restore commands, restore failure and background restore coordination.
- Mozilla's `web-ext lint` reports zero errors, notices or warnings.
- Live Firefox checks with the complete add-on installed exercised the popup document, background messaging, isolated content script and page bridge on signed-out YouTube. Restoration rebuilt a two-video native queue, selected the second video and restored its position to 35 seconds.
- The popup's saved and empty states and restore feedback were checked in Firefox with mocked extension APIs.

The add-on still needs a check in your signed-in Firefox profile. Full browser restart behaviour has not been tested.

## Behaviour

- Polls YouTube's queue once a second. Updates playback position roughly every ten seconds, and also attempts a save when pausing, hiding or leaving a tab.
- Stores queue data using `browser.storage.local`. No separate server, API key or additional Google authorisation is needed.
- Stores one current queue and one previous copy. A change to the video list or order moves the current copy to the previous slot. Position and title updates do not rotate the backup.
- Ignores normal playlists, recommended videos, empty queues, advert playback and detected partial queues. Clearing the queue on YouTube leaves the saved copy available.
- Restores only when you press the popup button. It first opens the saved video on a fresh watch page in the active YouTube tab, or opens a new watch tab if you are elsewhere. It waits for that page to load before rebuilding the queue. This also supports restoring from YouTube's homepage or while a different playlist is open.
- Keeps the saved copy if restoration fails. A failed restore is excluded from automatic saves until the queue's order or contents change.
- With multiple YouTube tabs, the most recent queue-list change takes ownership of the saved copy. Passive playback in another tab cannot overwrite it. All tabs share the same saved queue; separate accounts and per-tab histories are not supported.
- **Restore previous copy** restores the previous queue and swaps it into the current slot after success. **Clear saved copies** removes both snapshots, with a second click to confirm. Further queue activity can create a new saved copy.

## Limitations

YouTube does not offer a public native-queue API. The adapter reads the page's `ytd-playlist-panel-renderer` data and player methods, and dispatches the same internal command type as YouTube's **Add to queue**. The current temporary queue identifier starts with `TLPQ`. YouTube can change any of these details without notice.

The extension supports the desktop site at `www.youtube.com`. It does not synchronise with mobile queues, YouTube Music or Firefox Sync. Live streams, unavailable/private videos, ads that block playback, long queues with unloaded continuation pages and queues above 1,000 entries may prevent capture or restoration. Existing snapshots remain available when capture is incomplete. Playback progress can lag by about ten seconds if the browser crashes.

Queue data is local to this Firefox profile. Removing the extension can remove its saved data. It is not a cloud backup.

## Structure

| File | Purpose |
| --- | --- |
| `lib/youtube.ts` | Native queue detection, extraction, command construction and verified restoration |
| `entrypoints/youtube-main.ts` | Page-context observation and restore bridge |
| `entrypoints/content.ts` | Isolated content script connecting the bridge to extension messaging |
| `entrypoints/background.ts` | Serialised storage writes and restoration coordination |
| `lib/queue.ts` | Snapshot validation, retention and backup rules |
| `entrypoints/popup/` | Saved queue preview and restore controls |
| `tests/` | Queue retention and YouTube adapter tests |

The page bridge accepts only validated snapshots, and the background script accepts captures only from the top frame of `https://www.youtube.com/`. Restoring and deleting saved copies require a request from an extension page. The page bridge itself runs in YouTube's JavaScript context, so the site can observe or alter that interaction.
