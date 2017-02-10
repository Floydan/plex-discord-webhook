# Plex Discord Webhook integration
This small node app is based on the https://github.com/plexinc/webhooks-slack library created  by plexinc.
I've only added the support for Discord webhooks and increased address lookup information

In order to run this app:
 
- Install [node.js](https://nodejs.org/en/).
- Clone the repository.
- Install dependencies using `npm install`.
- Make a new app at Heroku, and add the Redis Cloud add-on (free plan) and note the app URL.
- Make a Discord webhook and note the URL, add the last part after /webhooks/ as a config var named DISCORD_WEBHOOK_KEY.
 - For example: '279401144396748544/gPy8loljUVY3MzsvIvFd9o7tllolp8SWavdwi0JwCpphKGLdadlsE8Dv4hlolhkd0hFA'
- Edit the options at the top of the index.js file. (namely: appURL)
- Deploy to Heroku
- Have anyone who wants to contribute add the webhook on https://app.plex.tv/web/app#!/account/webhooks