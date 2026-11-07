import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Snapshot } from './change';

const FILE = resolve(__dirname, '../../data/last-rates.json');

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await readFile(FILE, 'utf8');
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export async function saveSnapshot(snap: Snapshot): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(snap, null, 2), 'utf8');
}
