import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Bubble Blaster game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Bubble Blaster: Rainbow Rescue<\/title>/i);
  assert.match(html, /Bubble Blaster/);
  assert.match(html, /Rainbow Rescue/);
  assert.match(html, /Play now/);
  assert.match(html, /No ads/);
  assert.match(html, /Plays offline/);
  assert.match(html, /Bubble Blaster 3D game arena/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("bundles the game and its offline shell", async () => {
  const [game, page, layout, packageJson, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/Game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(game, /import \* as THREE from "three"/);
  assert.match(game, /requestPointerLock/);
  assert.match(game, /localStorage\.getItem\("bubble-blaster-best"\)/);
  assert.match(game, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(page, /<Game \/>/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(packageJson, /"three":/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /caches\.match/);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
