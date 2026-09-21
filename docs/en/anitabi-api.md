---
title: Anitabi API Notes
description: Technical notes about the public anitabi.cn interfaces and data structures used by Anitabi App.
---

# Anitabi API Notes

This page summarizes developer notes from examining the public data exposed by the anitabi.cn anime pilgrimage map. Anitabi App uses public anitabi.cn interfaces to retrieve anime information, pilgrimage spots, images, and related data.

## Main data sets

- `g0.json` through `g5.json`: Per-title themes, spot details, images, notes, and related values.
- `g.json`: Anime information, representative location, zoom level, spot coordinates, and priority values.
- A spot may include an ID, name, coordinates, image, episode, note, and folder.
- An anime entry may include titles, city, color, cover, category, representative coordinates, and a list of spots.

These interfaces are operated by a third party and may change or become unavailable without notice. Implementations should handle missing values and request failures.

## Official public API documentation

[anitabi.cn-document API documentation](https://github.com/anitabi/anitabi.cn-document/blob/main/api.md)

## Detailed analysis

For full response examples and TypeScript types, see the [original Chinese technical notes](/anitabi-api).
