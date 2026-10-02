# Test APK startup timing

The `Android Test Build (Release APK)` workflow keeps `[startup-timing]` logcat
messages in its release optimized APK. Production and preview builds still remove
JavaScript console calls.

To collect a cold start without deleting other device logs:

```powershell
adb shell am force-stop bbf.anitabiapp.test
adb shell am start -n bbf.anitabiapp.test/.MainActivity
adb logcat -d -v threadtime -s ReactNativeJS:I ActivityTaskManager:I WindowManager:I dev.expo.updates:I |
  Select-String 'startup-timing|bbf.anitabiapp.test|Updates state change'
```

`wallMs` aligns each JavaScript marker with Android log timestamps. `sinceFirstMarkMs`
is a monotonic JavaScript interval measured from `js-timing-start` in the custom
entry file, before Expo Router loads the route tree; it is not an Android process
start time. `durationMs` measures only the named operation.

Key events:

- `map-cache-read`: each MMKV read and JSON parse, including the payload length.
- `root-import-complete`, `root-mounted`, `root-layout`: root module evaluation,
  React commit, and layout. Layout is not proof that a frame was displayed.
- `native-splash-hide-request`: the root view has laid out and requests the
  native splash to close. Compare this with Android's actual splash removal log;
  the request timestamp alone is not the measured disappearance time.
- `map-data-initialize-after-hide-request`: deferred map cache initialization begins
  after the hide request has resolved and another frame has been scheduled.
- `home-mounted`, `map-points-geojson`, `point-image-index`: first screen work.
- `first-visible-map-point`: after a fully rendered map event, a test-build-only
  query found at least one visible feature in the `points` layer. Its JS callback
  timestamp is an upper bound for the first rendered point, not a pixel timestamp.
- `overlay-mounted`, `overlay-hidden`: present only in earlier test builds;
  the root layout no longer renders the extra blue overlay.
- `location-permission-check`, `location-permission-result`: the startup
  permission check. `location-permission-request` appears when access is not
  already granted and a permission prompt may be needed.
- `map-ready`: Mapbox's `onDidFinishLoadingMap` callback.
- `sprite-crop-start`, `sprite-crop-complete`: all bangumi sprite icon crops.

Compare the system's splash window removal with first screen computation and
`map-ready`. Keep the device, data cache, and
network conditions fixed across repeated launches.
