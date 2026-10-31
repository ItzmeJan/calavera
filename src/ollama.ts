/**
 * The only place that talks to a model.
 *
 * There is no API key and no cloud account here: we speak the Ollama chat
 * protocol on localhost. Swapping the model is one environment variable.
 */

const HOST = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
export const MODEL = process.env.CALAVERA_MODEL ?? "gemma4:cloud";
const TIMEOUT_MS = 180_000;

export type Whisper = {
  epitaph: string;
  remembrance: string;
  whisper: string;
};

export type Memorial = {
  name: string;
  relation: string;
  memory: string;
  foods: string[];
  song: string;
};

const SYSTEM = `You help someone build a virtual ofrenda (an altar for Día de los Muertos).
Given a few details about a person, write three short pieces.
Speak warmly and concretely, the way a family remembers someone out loud.
Never invent facts that were not given. Never mention death statistics or illness.
Avoid the words "journey", "beacon", "shimmer", and "essence".

Reply with a single JSON object and nothing else:
{
  "epitaph": "one line, under 90 characters, for a small ceramic plaque",
  "remembrance": "two or three sentences in first person plural ('we'), grounding it in the details given",
  "whisper": "one short sentence said softly, as if carried by the candle flame"
}`;

export async function writeWhisper(memorial: Memorial): Promise<Whisper> {
  const details = [
    `Name: ${memorial.name}`,
    memorial.relation && `Relationship: ${memorial.relation}`,
    memorial.memory && `A memory: ${memorial.memory}`,
    memorial.foods.length > 0 && `Favourite foods: ${memorial.foods.join(", ")}`,
    memorial.song && `A song they loved: ${memorial.song}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.8 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: details },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ModelError(
      `Could not reach Ollama at ${HOST} (${reason}). Is \`ollama serve\` running?`,
      502,
    );
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ModelError(
      `Ollama rejected the request with ${response.status}. ${body.slice(0, 300)}`.trim(),
      502,
    );
  }

  const payload = (await response.json()) as { message?: { content?: string } };
  const raw = payload.message?.content ?? "";
  const parsed = parseWhisper(raw);

  if (!parsed) {
    throw new ModelError(`Model ${MODEL} did not return usable JSON.`, 502);
  }
  return parsed;
}

export class ModelError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parseWhisper(raw: string): Whisper | null {
  const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const read = (key: string, max: number) => {
    const field = record[key];
    if (typeof field !== "string") return null;
    const text = field.trim().replace(/\s+/g, " ");
    return text ? text.slice(0, max) : null;
  };

  const epitaph = read("epitaph", 160);
  const remembrance = read("remembrance", 600);
  const whisper = read("whisper", 200);
  if (!epitaph || !remembrance || !whisper) return null;

  return { epitaph, remembrance, whisper };
}
