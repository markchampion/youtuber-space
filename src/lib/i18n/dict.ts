// All UI strings, one namespace per area of the app. Add a namespace by creating messages/<name>.ts.
import type { UiLocale } from "./core";
import * as common from "./messages/common";
import * as nav from "./messages/nav";
import * as settings from "./messages/settings";
import * as voice from "./messages/voice";
import * as script from "./messages/script";
import * as ideas from "./messages/ideas";
import * as channel from "./messages/channel";
import * as media from "./messages/media";
import * as products from "./messages/products";

export const en = {
  common: common.en,
  nav: nav.en,
  settings: settings.en,
  voice: voice.en,
  script: script.en,
  ideas: ideas.en,
  channel: channel.en,
  media: media.en,
  products: products.en,
};

const vi = {
  common: common.vi,
  nav: nav.vi,
  settings: settings.vi,
  voice: voice.vi,
  script: script.vi,
  ideas: ideas.vi,
  channel: channel.vi,
  media: media.vi,
  products: products.vi,
};

export type Dict = typeof en;

export const DICTS: Record<UiLocale, Dict> = { en, vi: vi as Dict };
