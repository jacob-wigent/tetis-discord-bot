# Tetis Discord Bot

dumb vibe-coded LLM discord bot 👍

this is the discord version of TetisGPT (a “physics assistant” in theory)

in practice it’s just an LLM hooked up to discord with some slash commands

it mostly works.

## Setup

```bash
npm install
```

add discord app stuff (.env)

### Register slash commands

commands live in `commands.js`

```bash
npm run register
```
### Run the Bot

```bash
node app.js
```
if you’re not a masochist:

```bash
npm install -g nodemon
nodemon app.js
```
### Make it Public (ngrok)

discord needs a public url, so:

```bash
ngrok http 3000
```

you’ll get something like:

```
https://1234-someurl.ngrok.io
```

go to your discord app settings → paste this as:

```
https://1234-someurl.ngrok.io/interactions
```

save and you’re good
