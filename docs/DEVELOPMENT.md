# Development

DotLater uses Manifest V3, plain JavaScript, and no runtime or npm dependencies.

## Repository layout

```text
manifest.json        Extension entry point (must remain at repository root)
src/                 Background worker, content script, options page
assets/icons/        Green and yellow dot PNG assets
docs/                Usage, privacy, third-party credits, publishing
tests/               Unit tests and isolated Edge integration test
.github/             GitHub repository settings and sponsorship preparation
```

## Test

Requires Node.js 22+ and, for browser integration tests, Microsoft Edge on macOS.

```sh
npm test
npm run test:browser
```

The browser test launches a disposable Edge profile using only the extension's production files. It doesn't touch the everyday Edge profile. The default shortcut is verified in that profile and was also tested with real keyboard input in Edge on macOS.

## Permissions and storage

`activeTab` grants access to the current tab when the user clicks the icon or invokes the shortcut. `scripting` changes and restores the favicon; `storage` retains temporary session marks and the delay preference. No host permissions, external requests, telemetry or account are required.

See [PRIVACY.md](PRIVACY.md) for details.

## Licenses and credits

DotLater code is [MIT licensed](../LICENSE), including permission for commercial use. Its yellow-dot icon originated from [Chat Dinger](https://github.com/rumblelab/chatdinger) (MIT), with a green color variant. The original copyright and license notice are preserved in [THIRD_PARTY_LICENSE.txt](THIRD_PARTY_LICENSE.txt).

The simple marking workflow was also informed by [Mark this tab!](https://github.com/esin/markThisTab). DotLater is independent of both projects.
