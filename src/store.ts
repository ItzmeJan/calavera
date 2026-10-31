/**
 * Ofrendas live as plain JSON files in ./ofrendas.
 * No database, no account: the altar stays on the machine that built it.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Memorial, type Whisper } from "./ollama";

const DIR = join(import.meta.dir, "..", "ofrendas");
const MAX_OFFRENDAS = 200;

export type Ofrenda = {
  id: string;
  createdAt: string;
  memorial: Memorial;
  whisper: Whisper;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidId(id: string): boolean {
  return ID.test(id);
}

export class InputError extends Error {}

/** Validates untrusted request input into a Memorial. */
export function readMemorial(input: unknown): Memorial {
  if (typeof input !== "object" || input === null) {
    throw new InputError("Expected a JSON object.");
  }
  const body = input as Record<string, unknown>;

  const text = (key: string, max: number, required = false): string => {
    const value = body[key];
    if (value === undefined || value === null) {
      if (required) throw new InputError(`"${key}" is required.`);
      return "";
    }
    if (typeof value !== "string") throw new InputError(`"${key}" must be text.`);
    const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
    if (required && !clean) throw new InputError(`"${key}" is required.`);
    if (clean.length > max) throw new InputError(`"${key}" is longer than ${max} characters.`);
    return clean;
  };

  const rawFoods = body.foods ?? [];
  if (!Array.isArray(rawFoods)) throw new InputError(`"foods" must be a list.`);
  if (rawFoods.length > 5) throw new InputError("Up to five favourite foods.");
  const foods = rawFoods.map((food, index) => {
    if (typeof food !== "string") throw new InputError("Each food must be text.");
    const clean = food.replace(/\s+/g, " ").trim();
    if (clean.length > 60) throw new InputError(`Food #${index + 1} is too long.`);
    return clean;
  }).filter(Boolean);

  return {
    name: text("name", 60, true),
    relation: text("relation", 60),
    memory: text("memory", 600),
    foods,
    song: text("song", 80),
  };
}

export async function saveOfrenda(memorial: Memorial, whisper: Whisper): Promise<Ofrenda> {
  const ofrenda: Ofrenda = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    memorial,
    whisper,
  };
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${ofrenda.id}.json`), JSON.stringify(ofrenda, null, 2), "utf8");
  return ofrenda;
}

export async function getOfrenda(id: string): Promise<Ofrenda | null> {
  if (!isValidId(id)) return null;
  try {
    const raw = await readFile(join(DIR, `${id}.json`), "utf8");
    const parsed = JSON.parse(raw) as Ofrenda;
    if (parsed?.id !== id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function listOfrendas(): Promise<Array<Pick<Ofrenda, "id" | "createdAt"> & { name: string }>> {
  let files: string[];
  try {
    files = await readdir(DIR);
  } catch {
    return [];
  }

  const found = await Promise.all(
    files
      .filter((file) => file.endsWith(".json") && isValidId(file.slice(0, -5)))
      .map(async (file) => {
        try {
          const raw = await readFile(join(DIR, file), "utf8");
          const ofrenda = JSON.parse(raw) as Ofrenda;
          return { id: ofrenda.id, createdAt: ofrenda.createdAt, name: ofrenda.memorial.name };
        } catch {
          return null;
        }
      }),
  );

  return found
    .filter((entry): entry is { id: string; createdAt: string; name: string } => entry !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_OFFRENDAS);
}
