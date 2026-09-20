# Tetis Discord Bot

Vibe-coded Discord bot (a “physics assistant” in theory). In practice it’s just an LLM hooked up to Discord with a few commands.

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

save and you’re good!
