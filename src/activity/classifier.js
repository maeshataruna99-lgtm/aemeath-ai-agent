'use strict';

// Turns "which window is in front" into a coarse category. The window title is
// read here and then dropped: only the category, an app name and, for games, the
// game name leave this function. Titles are never stored or sent anywhere.
//
// Private browser windows, password managers and the lock screen are not read.

const BROWSERS = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera', opera_gx: 'Opera GX',
  vivaldi: 'Vivaldi', arc: 'Arc', chromium: 'Chromium', librewolf: 'LibreWolf', waterfox: 'Waterfox', iexplore: 'Internet Explorer',
};

const IGNORED_PROCESSES = new Set([
  // password managers and authenticators
  'keepass', 'keepassxc', 'bitwarden', '1password', 'lastpass', 'dashlane', 'nordpass', 'authy', 'enpass',
  // the lock screen and the UAC prompt
  'lockapp', 'logonui', 'consent', 'credentialuibroker',
  // this app itself
  'electron', 'aemeath',
]);

const PRIVATE_WINDOW = /\b(inprivate|incognito|private browsing|private window|penjelajahan pribadi|jendela pribadi|mode penyamaran)\b/i;

const CODING = {
  code: 'VS Code', 'code - insiders': 'VS Code', cursor: 'Cursor', windsurf: 'Windsurf', zed: 'Zed',
  idea64: 'IntelliJ IDEA', pycharm64: 'PyCharm', webstorm64: 'WebStorm', phpstorm64: 'PhpStorm',
  rider64: 'Rider', clion64: 'CLion', goland64: 'GoLand', datagrip64: 'DataGrip', studio64: 'Android Studio',
  devenv: 'Visual Studio', sublime_text: 'Sublime Text', 'notepad++': 'Notepad++', atom: 'Atom',
  windowsterminal: 'Terminal', wt: 'Terminal', powershell: 'PowerShell', pwsh: 'PowerShell', cmd: 'Command Prompt',
  nvim: 'Neovim', vim: 'Vim', githubdesktop: 'GitHub Desktop',
};

const WORK = {
  winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', onenote: 'OneNote', outlook: 'Outlook',
  acrord32: 'Acrobat', acrobat: 'Acrobat', soffice: 'LibreOffice', notion: 'Notion', obsidian: 'Obsidian', figma: 'Figma',
};

const CHAT_APPS = {
  discord: 'Discord', telegram: 'Telegram', whatsapp: 'WhatsApp', slack: 'Slack', teams: 'Teams', 'ms-teams': 'Teams',
  zoom: 'Zoom', skype: 'Skype', signal: 'Signal', line: 'LINE',
};

const SOCIAL_APPS = {
  tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', twitter: 'X', threads: 'Threads', reddit: 'Reddit',
};

const MEDIA_APPS = { spotify: 'Spotify', vlc: 'VLC', wmplayer: 'Media Player', musicbee: 'MusicBee', applemusic: 'Apple Music' };

const LAUNCHERS = {
  steam: 'Steam', steamwebhelper: 'Steam', epicgameslauncher: 'Epic Games', 'battle.net': 'Battle.net',
  ubisoftconnect: 'Ubisoft Connect', upc: 'Ubisoft Connect', riotclientservices: 'Riot Client', galaxyclient: 'GOG Galaxy',
};

// Game processes that name themselves. Unreal games share a process name, so
// those are recognised from the install folder or the window title instead.
const GAME_PROCESSES = {
  genshinimpact: 'Genshin Impact', yuanshen: 'Genshin Impact', starrail: 'Honkai: Star Rail',
  zenlesszonezero: 'Zenless Zone Zero', robloxplayerbeta: 'Roblox', 'valorant-win64-shipping': 'VALORANT',
  leagueoflegends: 'League of Legends', dota2: 'Dota 2', cs2: 'Counter-Strike 2',
  'fortniteclient-win64-shipping': 'Fortnite', r5apex: 'Apex Legends', eldenring: 'Elden Ring',
  cyberpunk2077: 'Cyberpunk 2077', terraria: 'Terraria', 'stardew valley': 'Stardew Valley', hollow_knight: 'Hollow Knight',
  'minecraft.windows': 'Minecraft', overwatch: 'Overwatch 2', gta5: 'Grand Theft Auto V', witcher3: 'The Witcher 3',
};

const GAME_TITLES = [
  [/wuthering waves|鸣潮/i, 'Wuthering Waves'],
  [/\bminecraft\b/i, 'Minecraft'],
];

// Install folders: [pattern, fixed name or null to use the first capture].
const GAME_PATHS = [
  [/\\wuthering waves[^\\]*\\/i, 'Wuthering Waves'],
  [/\\steamapps\\common\\([^\\]+)\\/i, null],
  [/\\epic games\\([^\\]+)\\/i, null],
  [/\\gog galaxy\\games\\([^\\]+)\\/i, null],
  [/\\riot games\\([^\\]+)\\/i, null],
];
const NOT_A_GAME = /^(steamworks|steam controller|steamvr|wallpaper_engine|launcher|epic online services|directx|common redist)/i;

// Page-title patterns, matched at the start or end of the page title so a
// document that merely mentions a site is not mistaken for the site itself.
const SOCIAL_SITES = [
  ['TikTok', 'tiktok'], ['Instagram', 'instagram'], ['Facebook', 'facebook'], ['Threads', 'threads'],
  ['Reddit', 'reddit'], ['Pinterest', 'pinterest'], ['Snapchat', 'snapchat'], ['Tumblr', 'tumblr'],
  ['Bluesky', 'bluesky'], ['Mastodon', 'mastodon'], ['Twitter', 'twitter'],
];
const VIDEO_SITES = [
  ['YouTube', 'youtube'], ['Twitch', 'twitch'], ['Netflix', 'netflix'], ['Bilibili', 'bilibili'],
  ['Vimeo', 'vimeo'], ['Disney+', 'disney\\+'], ['Prime Video', 'prime video'],
];
const CHAT_SITES = [
  ['WhatsApp', 'whatsapp'], ['Telegram', 'telegram'], ['Discord', 'discord'], ['Messenger', 'messenger'],
];

const BROWSER_SUFFIX = /(chrome|edge|firefox|brave|opera|vivaldi|chromium|arc|librewolf|waterfox)/i;

function nameOf(process, table) {
  return Object.prototype.hasOwnProperty.call(table, process) ? table[process] : null;
}

// Drops the trailing " - Google Chrome" style part of a browser window title.
function pageTitleOf(title) {
  const parts = title.split(/\s[-–—]\s/);
  if (parts.length > 1 && BROWSER_SUFFIX.test(parts[parts.length - 1])) parts.pop();
  return parts.join(' - ');
}

// The site name must open the page title or close it, and in both cases stand on
// its own ("Instagram", "Facebook - log in", "r/pics - Reddit"), so a document that
// merely starts with the word ("Instagram marketing plan") is not mistaken for it.
const SEPARATORS = '[-|\\u2013\\u2014\\u00b7\\u2022:/]';

function siteMatches(page, keyword) {
  const start = new RegExp('^(\\(\\d+\\)\\s*)?' + keyword + '\\s*($|' + SEPARATORS + ')', 'i');
  const end = new RegExp('(^|\\s' + SEPARATORS + '\\s*)' + keyword + '\\s*$', 'i');
  return start.test(page) || end.test(page);
}

function siteOf(page) {
  // X titles look like "Home / X" or "Someone on X: ...".
  if (/\s\/\sX$/.test(page) || /\son X:/.test(page)) return { kind: 'social', name: 'X' };
  const isYouTube = siteMatches(page, 'youtube');
  if (isYouTube && /\bshorts\b/i.test(page)) return { kind: 'social', name: 'YouTube Shorts' };
  for (const [name, keyword] of SOCIAL_SITES) if (siteMatches(page, keyword)) return { kind: 'social', name: name };
  for (const [name, keyword] of VIDEO_SITES) if (siteMatches(page, keyword)) return { kind: 'video', name: name };
  for (const [name, keyword] of CHAT_SITES) if (siteMatches(page, keyword)) return { kind: 'chat', name: name };
  return { kind: 'other', name: '' };
}

function gameOf(process, title, exePath) {
  const byProcess = nameOf(process, GAME_PROCESSES);
  if (byProcess) return byProcess;
  for (const [pattern, fixed] of GAME_PATHS) {
    const match = pattern.exec(exePath);
    if (!match) continue;
    const name = fixed || match[1];
    if (!fixed && NOT_A_GAME.test(name)) continue;
    return name;
  }
  for (const [pattern, name] of GAME_TITLES) if (pattern.test(title)) return name;
  return null;
}

function capitalise(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

const IGNORED = { category: 'ignored', app: '', game: null, site: '', social: false };

// sample: { process, title, path }. Returns { category, app, game, site, social } where
// category is one of: game, social, video, chat, coding, work, media, launcher, browser,
// other, ignored.
function classify(sample) {
  const process = String((sample && sample.process) || '').toLowerCase().replace(/\.exe$/, '');
  const title = String((sample && sample.title) || '');
  const exePath = String((sample && sample.path) || '');
  if (!process || IGNORED_PROCESSES.has(process)) return IGNORED;

  const browser = nameOf(process, BROWSERS);
  if (browser) {
    if (PRIVATE_WINDOW.test(title)) return IGNORED;
    const site = siteOf(pageTitleOf(title));
    return {
      category: site.kind === 'other' ? 'browser' : site.kind,
      app: browser,
      game: null,
      site: site.name,
      social: site.kind === 'social',
    };
  }

  const launcher = nameOf(process, LAUNCHERS);
  if (launcher) return { category: 'launcher', app: launcher, game: null, site: '', social: false };

  const game = gameOf(process, title, exePath);
  if (game) return { category: 'game', app: game, game: game, site: '', social: false };

  const table = [[CODING, 'coding'], [WORK, 'work'], [CHAT_APPS, 'chat'], [SOCIAL_APPS, 'social'], [MEDIA_APPS, 'media']];
  for (const [apps, category] of table) {
    const app = nameOf(process, apps);
    if (app) return { category: category, app: app, game: null, site: '', social: category === 'social' };
  }
  return { category: 'other', app: capitalise(process), game: null, site: '', social: false };
}

// A short, honest description of what Aemeath currently sees (never a title).
function describe(info) {
  if (!info) return 'belum ada';
  switch (info.category) {
    case 'game': return 'bermain ' + info.game;
    case 'social': return 'media sosial (' + (info.site || info.app) + ')';
    case 'video': return 'menonton video (' + (info.site || info.app) + ')';
    case 'chat': return 'mengobrol (' + (info.site || info.app) + ')';
    case 'coding': return 'ngoding (' + info.app + ')';
    case 'work': return 'bekerja (' + info.app + ')';
    case 'media': return 'mendengarkan musik (' + info.app + ')';
    case 'launcher': return 'membuka launcher (' + info.app + ')';
    case 'browser': return 'menjelajah web (' + info.app + ')';
    case 'ignored': return 'tidak dibaca (jendela pribadi atau sensitif)';
    default: return 'memakai ' + info.app;
  }
}

module.exports = { classify, describe, pageTitleOf };
