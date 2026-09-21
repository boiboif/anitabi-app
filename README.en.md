# Anitabi App

[简体中文](README.md) | English | [日本語](README.ja.md)

> 🚀 **Actively evolving** — The core features are ready to use, with more improvements and capabilities on the way.

An Expo-based mobile map app for anime location pilgrimages, showing real-world anime locations on a world map. Data is provided by [anitabi.cn](https://www.anitabi.cn).

> [Website](https://boiboif.github.io/anitabi-app/en/) · [Download](https://boiboif.github.io/anitabi-app/en/download) · [Privacy Policy](docs/en/PRIVACY.md) · [Contributing Guide](CONTRIBUTING.md)

### Why this app?

I used the Anitabi website while traveling and found its rich collection of pilgrimage data incredibly helpful. It also inspired me to create a smoother experience for mobile devices, so I built this app to make future pilgrimages easier for myself and, hopefully, for fellow fans as well.

## Current Status

The app currently supports map browsing, anime location rendering and search, favorites, pilgrimage plan management with sharing and importing, and comparison photography. Favorites and pilgrimage plans are persisted locally. See the roadmap below for what is coming next.

## Feature Highlights

- **Explore the map**: Browse anime locations around the world and filter pilgrimage spots by anime title.
- **Search and favorites**: Search for anime titles and locations, save places you want to visit or have already visited, view location details, and open them directly in a navigation app.
- **Pilgrimage plans**: Organize multiple locations into dedicated itineraries, then share or import them using QR codes or plan files.
- **Comparison photography**: Use an anime screenshot as an on-site composition guide, take a photo, and generate a side-by-side pilgrimage comparison image.
- **Local-first**: No account is required. Favorites, plans, and generated images are stored on your device by default.
- **Optimized caching**: Map data and image assets are cached to reduce repeated loading and keep browsing smooth when the network is unstable.
- **Familiar, but more polished**: Retains the familiar experience of [anitabi/map](https://anitabi.cn/map), so existing users can get started immediately, while further refining interactions for mobile devices.

## Platform Support

- Android 7.0 or later (API 24; download the signed APK from the [download page](https://boiboif.github.io/anitabi-app/en/download))
- iOS / iPadOS 16.4 or later (download the unsigned IPA from [GitHub Releases](https://github.com/boiboif/anitabi-app/releases) and sign it by following the [iOS sideloading guide](docs/en/guide/ios-sideloading.md))

## Screenshots

<p align="center">
  <img src="https://i0.hdslb.com/bfs/new_dyn/27f14bcd8532a28aa94b2c7e4befdfbf1519338.jpg" width="172" alt="Map home screen 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/bfde030847ba8abcd609ab61afebae671519338.jpg" width="172" alt="Map home screen 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/27d02376ce308b975fd2f9dee7514c251519338.jpg" width="172" alt="Map home screen 3" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/48470d9965423be5c3e99076708d203f1519338.jpg" width="172" alt="Anime details" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/41922586277a7302e9828af7c7a27c8d1519338.jpg" width="172" alt="Search screen 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/6fd051ad87aa34fe31b294af191b47411519338.jpg" width="172" alt="Search screen 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/78fb71aa4c555227d2731e4166c3d9d51519338.jpg" width="172" alt="Favorites screen 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/364a53e928ebf646cccd2684962e482e1519338.jpg" width="172" alt="Favorites screen 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/2ded6575449c3c2cbd246598f68b90c51519338.jpg" width="172" alt="Pilgrimage plan" />
  <img src="http://i0.hdslb.com/bfs/new_dyn/4a0a2ce7f6e8895cb7e58288ba003ac11519338.jpg" width="172" alt="Share a pilgrimage plan" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/77b0b9e7636e86d058771cc0bbdbd29e1519338.jpg" width="172" alt="Location comparison photo" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/09f173b924073edfc887e0897df334551519338.jpg" width="172" alt="Profile screen" />
</p>

## Roadmap

- [x] Fetch and process Anitabi data
- [x] Dark mode
- [x] Map rendering with Mapbox
- [x] Display anime pilgrimage locations on the map
- [x] Search for anime titles and locations
- [x] Show location images on the map
- [x] Filter map locations by anime title
- [x] Location details
- [x] Favorite locations
- [x] Pilgrimage plans
- [x] Share and import pilgrimage plans
- [x] Capture and generate comparison images
- [x] Internationalization
- [ ] AI-powered route planning

## Disclaimer

Anitabi App is an unofficial open-source client and is not affiliated with, authorized by, or endorsed by [anitabi.cn](https://www.anitabi.cn) or the rights holders of any related works. The project is provided as is, and no guarantee is made that third-party data will always be accurate, complete, or available. Please use your own judgment and comply with applicable rules and laws.

Maps, anime information, images, and other third-party content belong to their respective rights holders. If you believe any content in this project infringes your rights, please contact the maintainers through an Issue so it can be reviewed promptly.

## Data Sources and Acknowledgements

Thanks to [anitabi.cn](https://www.anitabi.cn) and its contributors for maintaining anime pilgrimage data and services. Map locations, anime information, and some related resources in this project come from anitabi.cn or its public APIs.

## Privacy

The app has no accounts or advertising. Favorites, plans, settings, and generated images are stored on your device by default. Map and data loading connect to anitabi.cn and Mapbox, while Sentry is used for crash and performance diagnostics; these services may receive essential network or device technical information. Location, camera, and photo permissions are only used when their corresponding features require them.

See the [Privacy Policy](docs/en/PRIVACY.md) for details.

## License

Original code in this project is licensed under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE). Third-party dependencies and content remain subject to their respective licenses or rights notices.

## Contributing

Issues, code improvements, documentation updates, and product suggestions are welcome. See the [Contributing Guide](CONTRIBUTING.md) to get involved.
