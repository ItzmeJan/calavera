# Calavera

A virtual ofrenda builder that runs on your own computer.

You give it a few details about someone you remember — a name, a memory, a food
they liked, a song. A locally served open-weight model writes the words that go
on the altar: a line for the plaque, a remembrance, and a whisper carried by the
candles. The altar is drawn with marigolds and saved as plain JSON next to this
README.

Built for the [Hacktoberfest Open-Source AI Challenge: Week 4 — Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).

## Why open

An ofrenda is about someone's family. A remembrance is not a prompt I want
shipped to a company that keeps it, prices it, and may retire the model behind
it next year.

So the model runs through [Ollama](https://ollama.com) on `127.0.0.1`, and the
altars are files in `./ofrendas`. No account, no API key, no telemetry, no fonts
or scripts fetched from a CDN. With the model pulled, the whole thing works with
the wifi off.

Swapping the model is one environment variable — `CALAVERA_MODEL`. That is the
part a closed API cannot offer: I can try a different family of weights, keep an
old one pinned for as long as I like, or move to a smaller quantised build to
run on a laptop. Nothing in the interface changes.

## Running it

Requires [Bun](https://bun.sh) and [Ollama](https://ollama.com).

```bash
ollama pull gemma4:cloud      # or any chat model you have
bun install
bun run start                 # http://localhost:3000
```

Optional environment variables:

| Variable          | Default                  | Meaning                          |
| ----------------- | ------------------------ | -------------------------------- |
| `PORT`            | `3000`                   | HTTP port                        |
| `OLLAMA_HOST`     | `http://127.0.0.1:11434` | Where Ollama is listening        |
| `CALAVERA_MODEL`  | `gemma4:cloud`           | Which local model writes the text |

Check it end to end:

```bash
bun run smoke
```

The smoke test starts the server on a random port, refuses an unnamed altar,
writes one for "Rosa Elena", reads it back, and prints the generated epitaph.

## How it is put together

```
public/index.html   the page: one form, one altar, no build step
src/server.ts       Bun.serve routes and error mapping
src/ollama.ts       the only module that talks to a model
src/store.ts        input validation + JSON files on disk
scripts/smoke.ts    end-to-end check
```

The model is asked for strict JSON (`format: "json"`), and the reply is
re-validated in `parseWhisper`: missing or non-string fields are rejected rather
than rendered, and lengths are capped. Every field coming back from the browser
is validated and length-limited in `readMemorial` before it reaches the model or
the disk. Altar IDs are UUIDs, checked against a regex before they are used to
build a path, so `?ofrenda=../../etc/passwd` is a 404 and nothing else.

## Licence

MIT — see [LICENSE](LICENSE).
