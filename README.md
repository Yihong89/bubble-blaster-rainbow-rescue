# Bubble Blaster: Rainbow Rescue

A cheerful, kid-friendly first-person bubble game built with Three.js, React,
and vinext. The game contains no graphic violence, ads, sign-in, or external
game assets.

## Play locally

You need Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser and select
**Play now**.

## Controls

- `W`, `A`, `S`, `D` or arrow keys: move
- Mouse: look around
- Click or `Space`: shoot a bubble
- Touchscreen: drag to look, use the movement pad, and tap **Bubble**
- `Esc`: pause and release the mouse

Bubble the friendly Wigglies before they reach you. Each successful bubble adds
to your score, and quick consecutive hits earn a streak bonus. The round lasts
75 seconds and the best score is saved on the device.

## Offline play

The production build includes an installable web-app manifest and a service
worker. After the game has been loaded once from a production server, its files
are cached for later offline play.

## Useful commands

```bash
npm run dev       # Start the local game
npm test          # Build and run the automated checks
npm run build     # Create the production build
npm run start     # Run the production build locally
```
