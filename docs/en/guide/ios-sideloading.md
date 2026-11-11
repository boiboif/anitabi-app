---
title: Sideload on iOS
description: Install Anitabi on an iPhone or iPad with Sideloadly or SideStore, manage refreshing and updates, and explore LiveContainer.
---

# Sideload on iOS

Anitabi's iOS app is distributed as an unsigned IPA. Use a sideloading tool to sign it with your own Apple account and install it. No jailbreak is required, and a free Apple account works.

## Choose an installation method

| Method                                      | Best for                                                           | How to refresh                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [Sideloadly](#sideloadly)                   | First-time sideloading or regular computer users                   | Refresh from a computer connected to your device by USB or the same network       |
| [SideStore](#sidestore)                     | Refreshing on your phone                                           | Install once using a computer, then refresh over Wi-Fi with LocalDevVPN connected |
| [LiveContainer + SideStore](#livecontainer) | Experienced users who want to run multiple apps inside a container | Refresh the container through SideStore; additional setup is required             |

For your first installation, we recommend **Sideloadly**. If you already have SideStore or AltStore set up, import the IPA downloaded below.

::: info Free account limits
Signatures last **7 days**. After expiration, the app will not open until refreshed. Each device can have up to **3 apps** signed with a free account installed at once, including SideStore itself. Automatic refreshing still requires the tool's operating conditions to be met; it does not make a signature permanent. See [Apple's account limits](https://developer.apple.com/help/account/basics/about-your-developer-account).
:::

::: warning Before you begin
Sideloading is not App Store or TestFlight distribution. Tools such as Sideloadly are third-party software and are not affiliated with Anitabi or Apple. Download tools only from their official websites, and never give your Apple account password, verification code, or recovery key to Anitabi maintainers or anyone else.
:::

## What you need

- A Windows or macOS computer.
- An iPhone or iPad running iOS / iPadOS 16.4 or later, plus a reliable data cable.
- An Apple account you can sign in to and complete two-factor authentication with. Keep track of which account you use for signing.
- The `anitabi-app-*-unsigned.ipa` from **Assets** in [Anitabi GitHub Releases](https://github.com/boiboif/anitabi-app/releases). Do not download a `Source code` archive or an Android `.apk`.

You cannot tap an IPA to install it like an Android APK. Select the file on your computer for Sideloadly. For SideStore or LiveContainer, save the IPA to the Files app on your phone, then select it using the tool's import option.

## Method 1: Sideloadly {#sideloadly}

### 1. Install the desktop tools

Download the Windows or macOS version from the [official Sideloadly website](https://sideloadly.io/). On Windows, also install the desktop versions of iTunes and iCloud using the links on that website; **do not use the Microsoft Store versions**. This is Sideloadly's requirement. For iloader, used to install SideStore, follow its own setup instructions.

### 2. Connect your device and install the IPA

1. Connect your iPhone or iPad with a data cable and unlock it. If **Trust This Computer?** appears, select **Trust** and enter your device passcode.
2. Open Sideloadly and confirm that **iDevice** shows the device you want to install on.
3. Click the IPA icon on the left and select `anitabi-app-*-unsigned.ipa`, or drag the file into the window.
4. Enter the signing account's email in **Apple ID**, keep automatic refreshing enabled, and select **Start**.
5. Enter your account password and verification code when prompted. Keep the device connected until **Done.** appears.
6. Follow [First launch setup](#first-launch) below to trust the developer and enable Developer Mode, then open Anitabi from the Home Screen.

### 3. Set up automatic refreshing

Your computer must be on and running **Sideloadly Daemon**, and it must be able to detect your device. A USB connection is enough for refreshing. To refresh over Wi-Fi, first pair using a cable, then configure the following:

- **Windows**: In the device's Summary page in iTunes, enable **Sync with this device over Wi-Fi**, then apply and sync.
- **macOS**: Select the device in Finder. Under **General**, enable **Show this device when on Wi-Fi**, then apply and sync.

Keep your computer and device on the same network. If the device is not detected, unlock it with the screen on or use USB. Check that refreshing succeeds before the seventh day. If you rarely use your computer, connect manually and sideload again. See the [Sideloadly FAQ](https://sideloadly.io/faq).

## Method 2: SideStore {#sidestore}

SideStore requires a computer for initial installation. Once configured, you can install and refresh apps on your phone. The steps below follow the [official SideStore installation guide](https://docs.sidestore.io/docs/installation/install).

### 1. Install iloader and LocalDevVPN

1. Download and install the desktop tool from the [official iloader website](https://iloader.app/). On Windows, configure iTunes and other requirements as described in the [SideStore prerequisites](https://docs.sidestore.io/docs/installation/prerequisites).
2. Install [LocalDevVPN](https://apps.apple.com/app/localdevvpn/id6755608044) on your iPhone or iPad, allow it to add a VPN configuration, and connect. If it is unavailable in your App Store region, check the available installation options in SideStore's official documentation before choosing this method.
3. Connect your phone to **Wi-Fi**. Cellular data alone does not meet SideStore's requirements. LocalDevVPN must be connected while installing, updating, or refreshing apps.

### 2. Install and initialize SideStore

1. Connect your device with a data cable, unlock it, and trust the computer.
2. Open iloader, sign in with your Apple account, select the device, and choose **Install SideStore (Stable)**.
3. After installation, follow [First launch setup](#first-launch) to trust the developer and enable Developer Mode.
4. With Wi-Fi and LocalDevVPN connected, open SideStore and sign in with the same Apple account used in iloader.
5. In **My Apps**, tap the remaining days next to SideStore to refresh SideStore itself first. If prompted to revoke or create a signing certificate, select **Yes** or **Refresh Now**. Refreshing may return you to the Home Screen; wait a few seconds before reopening it.

### 3. Import Anitabi

1. Download the IPA on your phone and save it to Files, or transfer it from your computer and save it there.
2. Open **My Apps** in SideStore, tap **+**, select `anitabi-app-*-unsigned.ipa`, and wait for installation to finish.
3. Open Anitabi from the Home Screen. For regular refreshing, connect to Wi-Fi and LocalDevVPN, then select **My Apps → Refresh All**. Confirm that the remaining validity has updated for both SideStore and Anitabi.

LocalDevVPN is used for SideStore's installation and refresh process. It does not need to stay on just to open Anitabi normally. If SideStore itself has expired and will not open, reconnect to your computer and reinstall it using iloader.

## Advanced: LiveContainer + SideStore {#livecontainer}

LiveContainer imports apps to run inside a container, so each imported app does not take up a separate sideloading slot. **The container itself still needs signing and refreshing.** This differs from installing directly to the Home Screen. This guide has not verified full Anitabi compatibility inside the container; use one of the first two methods for your first installation.

### 1. Install the integrated version

Follow the SideStore preparation steps above to install the latest iloader and LocalDevVPN and connect your device. In iloader, choose **LiveContainer+SideStore**, then complete [First launch setup](#first-launch). The integrated version takes up one sideloading slot in total; you do not need to install standalone SideStore first.

### 2. Set up the built-in SideStore and certificate

1. With Wi-Fi and LocalDevVPN connected, open LiveContainer and enter its built-in SideStore from the **Apps** page.
2. Sign in with your signing account in SideStore's settings. If an older configuration already shows you as signed in, sign out and sign in again.
3. In **My Apps**, select **Refresh All**. When refreshing finishes, quit the built-in SideStore and reopen LiveContainer.
4. In LiveContainer's settings, select **Import Certificate from SideStore** and confirm. The button changes to **Remove Certificate** after a successful import. You can also check your setup with **JIT-Less Mode Diagnose**.

### 3. Import and run Anitabi

Return to **LiveContainer's Apps page**, tap **+**, and select the Anitabi IPA in Files. After importing, open it from the container's app list. Import into LiveContainer here: installing Anitabi directly through the built-in SideStore still uses a regular sideloading slot.

Refresh the container afterward using **Refresh All** in the built-in SideStore. For certificate or app issues, see the [official LiveContainer + SideStore guide](https://livecontainer.github.io/docs/installation/lc_sidestore) and [guest app FAQ](https://livecontainer.github.io/docs/faq/using-guest-apps).

## First launch setup {#first-launch}

### Trust the developer

Open **Settings → General → VPN & Device Management**. Under **Developer App**, select the Apple account used for signing, then select **Trust** and confirm. Newer iOS versions may show **Allow & Restart**; follow the system prompts.

### Enable Developer Mode

All iOS / iPadOS versions supported by Anitabi require Developer Mode for apps signed this way. Open **Settings → Privacy & Security → Developer Mode**, enable it, restart as instructed, then unlock your device and confirm again.

If the option is missing, connect to a computer, complete pairing, and try installing before checking Settings again. Trusting the computer, trusting the developer, and enabling Developer Mode are separate steps; none replaces another. See [Apple's Developer Mode documentation](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

## Updates and keeping your data

**Refreshing** extends the current app's validity. **Updating the app package** requires importing a newer IPA; a sideloading tool's refresh does not update the package. Compatible over-the-air updates supported by Anitabi still take effect as prompted in the app, without reimporting an IPA.

1. Before updating or changing installation methods, save important data through **Me → Backup & restore → Export backup** in Anitabi. Include pilgrimage records and photos if you want to keep them, and save the backup outside the app.
2. Download the new `*-unsigned.ipa` from [GitHub Releases](https://github.com/boiboif/anitabi-app/releases).
3. Install over the existing app using the same tool, Apple account, and app identifier (bundle ID). Keep the identifier unchanged and do not delete the old app first. In Sideloadly, keep automatic refreshing enabled. In SideStore, use **+** again to import the newer IPA.

Using the same account and app identifier usually preserves local data, but it does not replace a backup. Directly sideloaded apps and LiveContainer use different data containers; do not assume data transfers automatically when switching methods. If an expired app will not open, first try refreshing by installing over it with the original account, then back up once you can access it again.

## Frequently asked questions

### Nothing happens when I tap the IPA

This is expected. Import the file in Sideloadly, SideStore, or LiveContainer. You cannot install it by tapping it directly in a browser or the Files app.

### “Untrusted Developer” appears or Developer Mode is required

Follow [First launch setup](#first-launch). If the account is missing from **VPN & Device Management**, first confirm that the tool reported a successful installation.

### “Unable to Verify App” or “App Is No Longer Available” appears

Check whether the signature has expired, keep the device online, and check the developer trust status. Refresh or install over the existing app using the original tool and Apple account. If SideStore also will not open, restore it using a computer first. Do not delete Anitabi just because it has expired, as this can erase local data.

### Sideloadly cannot find the device

Make sure the device is unlocked and trusts the computer, then try another data-capable cable or USB port. On Windows, confirm that iTunes and iCloud are the desktop versions linked by the Sideloadly website.

### SideStore cannot install or refresh apps

Confirm that the device is on Wi-Fi and LocalDevVPN is connected. Temporarily disconnect other VPNs that may conflict. If the pairing file has expired, particularly after an iOS update or reset, reconnect to your computer and follow [SideStore's pairing file recovery guide](https://docs.sidestore.io/docs/advanced/pairing-file).

### The app or App ID limit has been reached

- **Installed app limit**: A free account allows up to three sideloaded apps per device at once, including SideStore. Back up before removing an unused sideloaded app.
- **App ID limit**: A free account can register up to 10 temporary App IDs, which expire after seven days. App extensions may also use IDs. Deleting an app does not immediately free these IDs; wait for them to expire. Do not repeatedly change the bundle ID to retry.

### Installing over the existing app fails

Check that you are using the same Apple account and bundle ID, and read the tool's specific error. Only consider removing the old app and reinstalling once you have saved a backup and confirmed that you can restore it. Deleting an app also deletes its local data.

This guide draws on [Kazumi's iOS installation guide](https://kazumi.app/docs/misc/how-to-install-in-ios/) and the tools' official documentation linked above. Interfaces and system prompts may change between versions; follow the latest official instructions.
