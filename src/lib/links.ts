// EVERY OUTBOUND ADDRESS, IN ONE PLACE. The engine keeps its hub addresses in a single
// `hubConfig.ts` for the stated reason that nothing else in the codebase should contain one — a URL
// spelled in two files is a URL that moves in one of them. Same rule here.

export const LINKS = {
  engine: 'https://starsystemx.com',
  hub: 'https://explorers.starsystemx.com',

  // THE INVITE IS THE PRIMARY LINK, not the channel. A `discord.com/channels/...` address only
  // resolves for somebody already in the server; everyone else gets an error page, which is the
  // worst possible answer to "come and tell us what broke". The invite works for both — it drops a
  // member straight in — so the channel address is used only where the text has already said the
  // reader would need to be a member.
  discordInvite: 'https://discord.gg/UAEq4zzjD8',
  discordChannel: 'https://discord.com/channels/1443167899933212744/1552262587708866570',
  discordChannelName: '#starsystem-converter-chat',

  repo: 'https://github.com/FrunkQ/starsystem-convert',
  engineRepo: 'https://github.com/FrunkQ/star-system-generator',

  // The same tip jar the engine's About box points at. Named `frunkq` rather than any project, so it
  // does not need changing when a fourth thing gets built.
  kofi: 'https://ko-fi.com/frunkq'
} as const;

/**
 * GETTING A FILE OUT OF THE OTHER PROGRAMS, which is the step people actually get stuck on.
 *
 * WHAT IS WRITTEN HERE IS WHAT THE FILE FORMATS THEMSELVES PROVE — the extension, the shape, where a
 * program of that kind keeps them. The exact menu wording is NOT stated, because this was written by
 * reading the saves rather than by driving either program, and a confidently wrong click-path is
 * worse than none: somebody follows it, finds no such menu, and concludes the tool is broken.
 *
 * `video` is null until a real link exists. An empty slot renders as nothing; it never renders as a
 * dead button.
 */
export interface HowTo {
  format: string;
  title: string;
  steps: string[];
  video: string | null;
}

export const HOW_TO: HowTo[] = [
  {
    format: 'ubox',
    title: 'Getting a file out of Universe Sandbox',
    steps: [
      'Save the simulation you want to convert. Universe Sandbox writes it as a single .ubox file.',
      'Saves live in your Universe Sandbox folder, under your user documents — the same place the program opens when you load one.',
      'Drop that .ubox straight onto this page. You do not need to unzip it, and you do not need to pick anything out of it.',
      'A save can hold more than one simulation. If yours does, this page will ask which one you meant.'
    ],
    video: null
  },
  {
    format: 'spaceengine',
    title: 'Getting a file out of SpaceEngine',
    steps: [
      'SpaceEngine describes systems in .sc catalogue files — plain text you can open in any editor.',
      'Its own systems live in the catalogue folder inside the SpaceEngine install; addons put theirs alongside.',
      'A system you have built or edited yourself is exported from the editor as a .sc.',
      'Drop the .sc on this page. A .pak addon works too — it is a zip of .sc files, and the catalogues are read straight out of it.'
    ],
    video: null
  }
];
