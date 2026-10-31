/**
 * Calavera — a local-first virtual ofrenda builder.
 *
 * Serves a single page, writes altars to disk, and asks a locally-served
 * open-weight model (Ollama) for the words on the altar.
 */

import { file } from "bun";
import { MODEL, ModelError, writeWhisper } from "./ollama";
import { getOfrenda, InputError, listOfrendas, readMemorial, saveOfrenda } from "./store";

const PORT = Number(process.env.PORT ?? 3000);
const PAGE = file(new URL("../public/index.html", import.meta.url));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ model: MODEL });
      }

      if (url.pathname === "/api/ofrendas" && request.method === "GET") {
        return json({ ofrendas: await listOfrendas() });
      }

      if (url.pathname === "/api/ofrendas" && request.method === "POST") {
        const body = await request.json().catch(() => {
          throw new InputError("Body must be valid JSON.");
        });
        const memorial = readMemorial(body);
        const whisper = await writeWhisper(memorial);
        return json(await saveOfrenda(memorial, whisper), 201);
      }

      const match = url.pathname.match(/^\/api\/ofrendas\/([^/]+)$/);
      if (match && request.method === "GET") {
        const ofrenda = await getOfrenda(decodeURIComponent(match[1]!));
        return ofrenda ? json(ofrenda) : json({ error: "No altar here." }, 404);
      }

      return json({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, 400);
      if (error instanceof ModelError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "Something went wrong on the altar." }, 500);
    }
  },
});

console.log(`Calavera is lit at http://localhost:${server.port}`);
console.log(`Model: ${MODEL} (via ${process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"})`);
