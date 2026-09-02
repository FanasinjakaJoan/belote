/* Build configuration.
   server      : base URL of the multiplayer server ('' = the site serving this page).
   staticBuild : true when the bundle is hosted without its own server
                 (GitHub Pages, Capacitor app…). Solo play always works;
                 online play then needs a server URL, set in the Join screen
                 or via ?server=https://host  */
window.BELOTE_CONFIG = {
  server: '',
  staticBuild: false,
  version: '2.1.0',
};
