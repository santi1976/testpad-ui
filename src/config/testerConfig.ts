// Configuration for tester normalization

export const testerConfig = {
  // Alias mapping -> canonical email
  aliases: {
    'Gaz': 'garreth.sutton@bitfinex.com',
    'Santiago': 'santiago.riveira@bitfinex.com',
    'santiago': 'santiago.riveira@bitfinex.com',
    'Sergei': 'sergei.basharov@bitfinex.com',
    'sergei': 'sergei.basharov@bitfinex.com',
    'eugene': 'eugene.glova@bitfinex.com',
    'Eugene': 'eugene.glova@bitfinex.com',
    'peter': 'peter.spigt@bitfinex.com',
    'Peter': 'peter.spigt@bitfinex.com',
    'vv': 'vuong.van@bitfinex.com',
    'VV': 'vuong.van@bitfinex.com',
    // TODO: Complete missing emails
    // 'Luis': 'luis.???@bitfinex.com',
    // 'gabriel': 'gabriel.???@bitfinex.com',
    // 'hanson': 'hanson.???@bitfinex.com',
    // 'hrayr': 'hrayr.???@bitfinex.com',
    // 'michal': 'michal.???@bitfinex.com',
  } as Record<string, string>,

  // Internal domains (always show)
  internalDomains: [
    'bitfinex.com',
    'tether.to',
  ],

  // Public domains (filter - should not be used)
  blacklistedDomains: [
    'gmail.com',
    'googlemail.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'yahoo.com',
    'yahoo.es',
    'icloud.com',
    'me.com',
    'aol.com',
    'protonmail.com',
    'proton.me',
    'mail.com',
    'gmx.com',
    'yandex.com',
  ],

  // Exclusion patterns (filter)
  excludePatterns: [
    /^[0-9]+$/,           // numbers only: "123"
    /[0-9]/,              // contains numbers: "santo123", "test1"
    /^.{1,2}$/,           // too short: "x", "ab"
    /^[^a-zA-Z0-9@]+$/,   // symbols only: "#$%"
    /^anyone$/i,          // placeholder
    /^guest$/i,           // placeholder
    /^test$/i,            // test
    /^user$/i,            // generic
  ],
}
