---
title: Sideload on iOS
description: Sign Anitabi's unsigned IPA with Sideloadly and install it on an iPhone or iPad.
---

# Sideload on iOS

Anitabi GitHub Releases provide an unsigned IPA. iOS cannot run unsigned apps, so opening the IPA from the Files app, a browser, or AirDrop will not install it. A sideloading tool temporarily signs the IPA with your own Apple account and installs it on your device.

::: warning Before you begin
Sideloading is not App Store or TestFlight distribution. Tools such as Sideloadly are third-party software and are not affiliated with Anitabi or Apple. Download tools only from their official websites, and never give your Apple account password, verification code, or recovery key to Anitabi maintainers or anyone else.
:::

## What you need

- A Windows or macOS computer.
- An iPhone or iPad running iOS / iPadOS 16.4 or later, plus a reliable data cable.
- An Apple account with two-factor authentication enabled. A free account can be used.
- The `anitabi-app-*-unsigned.ipa` downloaded from [Anitabi GitHub Releases](https://github.com/boiboif/anitabi-app/releases).
- Sideloadly downloaded and installed from the [official Sideloadly website](https://sideloadly.io/).

Windows users also need the desktop versions of iTunes and iCloud required by Sideloadly. Install them through the links on the Sideloadly website rather than from the Microsoft Store.

## Install with Sideloadly

1. Connect your iPhone or iPad to the computer with a cable and unlock the device.
2. If the device asks whether to trust the computer, choose **Trust** and enter your device passcode.
3. Open Sideloadly and confirm that your device appears in the device list.
4. Drag the downloaded `*-unsigned.ipa` into Sideloadly, or select it using the IPA icon.
5. Enter the email address of the Apple account used for signing, then select **Start**.
6. Follow the prompts to sign in and complete two-factor authentication, then wait for Sideloadly to report that installation has finished.
7. If prompted to enable Developer Mode, open **Settings → Privacy & Security → Developer Mode**, restart as instructed, and confirm that it is enabled.
8. If the first launch says the developer is not trusted, open **Settings → General → VPN & Device Management**, select the corresponding Apple account, and confirm trust.
9. Return to the Home Screen and open Anitabi.

Apple requires Developer Mode for locally installed development apps. The option usually appears after pairing the device with a computer or after the first installation attempt, and its wording may vary by iOS version. See [Apple's Developer Mode documentation](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

## Expiration, refreshing, and updates

A free Apple account that is not enrolled in the Apple Developer Program has these limitations:

- The signature and provisioning profile usually remain valid for only seven days. The app will no longer open after they expire.
- A device can have at most three apps signed with a free account installed at the same time.
- The app must be refreshed before expiration or sideloaded again afterward using the same IPA.

Sideloadly can attempt automatic refreshing while the computer and device are connected by USB or on the same network. To update Anitabi, sideload the new IPA using the same Apple account and bundle ID. This will usually install over the existing version and preserve local data. Back up important data first, and do not delete the old version without a backup.

See [Apple's developer account documentation](https://developer.apple.com/help/account/basics/about-your-developer-account) for free-account limitations and the [Sideloadly FAQ](https://sideloadly.io/faq) for refresh options.

## Other sideloading tools

If you already use SideStore, AltStore, or another trusted tool, you can import the same unsigned IPA. These tools also sign it with your Apple account or developer certificate; they do not make iOS run unsigned apps directly. Follow the official documentation for your chosen tool.

## Frequently asked questions

### Nothing happens when I tap the IPA

This is expected. An unsigned IPA cannot be installed directly like an Android APK. It must first be signed through a sideloading tool.

### “Unable to Verify App” or “App Is No Longer Available” appears

The signature may have expired, or the device may be temporarily unable to verify it. Keep the device online, sideload again with the original Apple account, and check the trust status under **VPN & Device Management**.

### Sideloadly cannot find the device

Make sure the device is unlocked and trusts the computer, then try another data-capable cable or USB port. On Windows, confirm that iTunes and iCloud are the desktop versions linked by the Sideloadly website.

### The app limit has been reached

A free account can have at most three sideloaded apps installed on one device at the same time. Remove an unused sideloaded app or use an account enrolled in the Apple Developer Program.

### Installing over the existing app fails

The old version may have been signed with another Apple account or a different bundle ID. Back up important in-app data, then remove the old version and install again. Deleting the app also deletes its local data.
