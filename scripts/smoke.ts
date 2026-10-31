/**
 * Smoke test: starts the server, writes an altar, reads it back, and checks
 * that bad input is refused. Uses whatever model is configured.
 *
 *   bun run smoke
 */

import { join } from "node:path";

const port = 4310 + Math.floor(Math.random() * 400);
const server = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "server.ts")], {
  env: { ...process.env, PORT: String(port) },
  stdout: "inherit",
  stderr: "inherit",
});

const base = `http://127.0.0.1:${port}`;
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ok — ${message}`);
};

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("Server did not start.");
}

try {
  await waitForServer();

  const health = await (await fetch(`${base}/api/health`)).json();
  console.log(`\nmodel: ${health.model}\n`);

  const page = await fetch(base);
  check(page.ok && (await page.text()).includes("Calavera"), "the altar page is served");

  const rejected = await fetch(`${base}/api/ofrendas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "   " }),
  });
  check(rejected.status === 400, "an unnamed altar is refused with 400");

  const missing = await fetch(`${base}/api/ofrendas/not-a-uuid`);
  check(missing.status === 404, "an invented id returns 404");

  console.log("\nasking the model for a remembrance…");
  const started = Date.now();
  const created = await fetch(`${base}/api/ofrendas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Rosa Elena",
      relation: "my grandmother",
      memory: "She peeled oranges in one long spiral and left them on the windowsill.",
      foods: ["pan dulce", "café de olla"],
      song: "Cielito Lindo",
    }),
  });
  const altar = await created.json();
  if (!created.ok) throw new Error(`FAILED: model call — ${altar.error}`);
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);

  check(created.status === 201, "an altar is written");
  check(typeof altar.whisper?.epitaph === "string" && altar.whisper.epitaph.length > 0, "it has an epitaph");
  check(typeof altar.whisper?.remembrance === "string" && altar.whisper.remembrance.length > 0, "it has a remembrance");
  check(Array.isArray(altar.memorial?.foods) && altar.memorial.foods.length === 2, "offerings survive the round trip");

  const reread = await (await fetch(`${base}/api/ofrendas/${altar.id}`)).json();
  check(reread.id === altar.id && reread.whisper.epitaph === altar.whisper.epitaph, "it is read back from disk");

  const list = await (await fetch(`${base}/api/ofrendas`)).json();
  check(list.ofrendas.some((entry: { id: string }) => entry.id === altar.id), "it appears in the archive");

  console.log(`\nepitaph: ${altar.whisper.epitaph}`);
  console.log(`whisper: ${altar.whisper.whisper}\n`);
  console.log("All checks passed.");
} finally {
  server.kill();
}
