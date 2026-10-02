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
is a monotonic JavaScript interval measured from `js-timing-start`; it is not an
Android process start time. `durationMs` measures only the named operation.

Key events:

- `map-cache-read`: each MMKV read and JSON parse, including the payload length.
- `root-import-complete`, `root-mounted`, `root-layout`: root module evaluation,
  React commit, and layout. Layout is not proof that a frame was displayed.
- `home-mounted`, `map-points-geojson`, `point-image-index`: first screen work.
- `overlay-mounted`, `overlay-hidden`: the extra blue overlay's React commits.
- `location-permission-check`, `location-permission-result`: the startup
  permission check. `location-permission-request` appears when access is not
  already granted and a permission prompt may be needed.
- `map-ready`: Mapbox's `onDidFinishLoadingMap` callback.
- `sprite-crop-start`, `sprite-crop-complete`: all bangumi sprite icon crops.

Compare the system's splash window removal with `overlay-hidden`, then compare
first screen computation and `map-ready`. Keep the device, data cache, and
network conditions fixed across repeated launches.
