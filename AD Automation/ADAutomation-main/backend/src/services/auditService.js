import { promises as fs } from 'node:fs';
import path from 'node:path';

const auditDir = path.resolve(process.cwd(), 'storage');
const auditFile = path.join(auditDir, 'audit-log.json');

async function ensureFile() {
  try {
    await fs.mkdir(auditDir, { recursive: true });
    await fs.access(auditFile);
  } catch {
    await fs.writeFile(auditFile, JSON.stringify([], null, 2), 'utf8');
  }
}

async function recordEvent(event) {
  await ensureFile();
  const existing = JSON.parse(await fs.readFile(auditFile, 'utf8'));
  existing.push(event);
  await fs.writeFile(auditFile, JSON.stringify(existing, null, 2));
}

export const auditService = {
  recordEvent,
  // Expose a reader so the student can build audit UI later on.
  async listEvents() {
    await ensureFile();
    return JSON.parse(await fs.readFile(auditFile, 'utf8'));
  }
};
