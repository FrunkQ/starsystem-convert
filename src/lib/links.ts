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
  engineRepo: 'https://github.com/FrunkQ/star-system-generator'
} as const;
