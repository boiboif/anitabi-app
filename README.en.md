<div align="center">
  <a href="https://boiboif.github.io/anitabi-app/en/">
    <img src="docs/public/app-icon.svg" width="128" alt="Anitabi Logo" />
  </a>

  <h1>Anitabi App</h1>
</div>

<p align="center"><strong>Turn anime scenery into your next journey.</strong></p>

> 🚀 **Actively evolving** — The core features are ready to use, with more improvements and capabilities on the way.

<p align="center">
  An Expo-based mobile map app for anime location pilgrimages, showing real-world anime locations on a world map. Data is provided by
  <a href="https://www.anitabi.cn">anitabi.cn</a>.
</p>

> [Website](https://boiboif.github.io/anitabi-app/en/) · [Download](https://boiboif.github.io/anitabi-app/en/download) · [Privacy Policy](docs/en/PRIVACY.md) · [Contributing Guide](CONTRIBUTING.md)
>
> Languages: [简体中文](README.md) · English · [日本語](README.ja.md)

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
  <img src="https://i0.hdslb.com/bfs/new_dyn/97e22595b8c228e4c30c056a2572afec1519338.jpg" width="172" alt="Map home screen 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/b3687a9d4eab02ed58034210f3112be31519338.jpg" width="172" alt="Map home screen 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/79bb05e933b4027b2b6e2b1dddb609141519338.jpg" width="172" alt="Map home screen 3" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/1af1aef8ccbf31c7925c3addddeff6f01519338.jpg" width="172" alt="Anime details" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/41922586277a7302e9828af7c7a27c8d1519338.jpg" width="172" alt="Search screen 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/b45bcce002dbe99e454bda39b2ebb0a61519338.jpg" width="172" alt="Favorites screen 1" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/fab9cdf3f0e45fad938e3c49fcf2fa0d1519338.jpg" width="172" alt="Favorites screen 2" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/9b03c9f653a5eeb731fe652ab61b950d1519338.jpg" width="172" alt="Pilgrimage plan" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/f3c3ed72e4b91dcee45c3627244623b71519338.jpg" width="172" alt="Pilgrimage plan map" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/ab332faa3d3aba74f78848a6d8316e971519338.jpg" width="172" alt="Share a pilgrimage plan" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/77b0b9e7636e86d058771cc0bbdbd29e1519338.jpg" width="172" alt="Location comparison photo" />
  <img src="https://i0.hdslb.com/bfs/new_dyn/cabd750d0cc64470fd4e27b7013bc9bc1519338.jpg" width="172" alt="Profile screen" />
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
