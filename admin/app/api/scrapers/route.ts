import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type VendorKey = 'superpharm' | 'massy' | 'pricesmart' | 'all';
type RunMode = 'full' | 'ingest-only' | 'backfill';

export type ScraperJobStatus = {
  id: string;
  vendor: VendorKey;
  mode: RunMode;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  pid: number | null;
  logTail: string[];
};

type InternalJob = {
  id: string;
  vendor: VendorKey;
  mode: RunMode;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  pid: number | null;
  logFile: string;
};

// Persist across Next.js dev HMR reloads via globalThis
const globalJobs = globalThis as unknown as {
  __scraperJobs?: Map<string, InternalJob>;
};
if (!globalJobs.__scraperJobs) {
  globalJobs.__scraperJobs = new Map<string, InternalJob>();
}
const jobsMap = globalJobs.__scraperJobs;

async function verifyAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Not signed in' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true, userId: user.id };
}

function readLogTail(logFile: string, maxLines = 40): string[] {
  try {
    if (!fs.existsSync(logFile)) return [];
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function serializeJobs(): ScraperJobStatus[] {
  return Array.from(jobsMap.values())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 10)
    .map((j) => ({
      id: j.id,
      vendor: j.vendor,
      mode: j.mode,
      status: j.status,
      startedAt: j.startedAt,
      endedAt: j.endedAt,
      exitCode: j.exitCode,
      pid: j.pid,
      logTail: readLogTail(j.logFile, 35),
    }));
}

export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({ jobs: serializeJobs() });
}

export async function POST(req: Request) {
  const auth = await verifyAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { vendor?: string; mode?: string; limit?: number };
  try {
    body = (await req.json()) as {
      vendor?: string;
      mode?: string;
      limit?: number;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const vendor = body.vendor as VendorKey;
  const mode = (body.mode ?? 'ingest-only') as RunMode;
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) && body.limit > 0
      ? Math.floor(body.limit)
      : null;

  if (!['superpharm', 'massy', 'pricesmart', 'all'].includes(vendor)) {
    return NextResponse.json(
      { error: 'vendor must be superpharm, massy, pricesmart, or all' },
      { status: 400 },
    );
  }
  if (!['full', 'ingest-only', 'backfill'].includes(mode)) {
    return NextResponse.json(
      { error: 'mode must be full, ingest-only, or backfill' },
      { status: 400 },
    );
  }

  // Prevent duplicate concurrent jobs for the same vendor
  for (const existing of jobsMap.values()) {
    if (
      existing.status === 'running' &&
      (existing.vendor === vendor || existing.vendor === 'all' || vendor === 'all')
    ) {
      return NextResponse.json(
        {
          error: `A job for ${existing.vendor} (${existing.mode}) is already running (PID ${existing.pid ?? 'unknown'})`,
        },
        { status: 409 },
      );
    }
  }

  const repoRoot = path.resolve(process.cwd(), '..');
  const scrapersDir = path.join(repoRoot, 'scrapers');
  if (!fs.existsSync(scrapersDir)) {
    return NextResponse.json(
      { error: `scrapers directory not found at ${scrapersDir}` },
      { status: 500 },
    );
  }

  const logsDir = path.join(scrapersDir, '.logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const jobId = `${vendor}-${mode}-${Date.now()}`;
  const logFile = path.join(logsDir, `${jobId}.log`);
  const runVendorScript = path.join(scrapersDir, 'run-vendor.js');

  const netFlags = [
    '--use-system-ca',
    '--dns-result-order=ipv4first',
    '--no-network-family-autoselection',
  ];
  const args: string[] = [...netFlags];
  if (fs.existsSync(runVendorScript)) {
    args.push(runVendorScript, vendor, '--mode', mode);
    if (limit != null) {
      args.push('--limit', String(limit));
    }
  } else if (mode === 'backfill') {
    args.push(path.join(scrapersDir, '_lib', 'backfill-matches.js'));
  } else {
    return NextResponse.json(
      { error: 'scrapers/run-vendor.js not found' },
      { status: 500 },
    );
  }

  const outStream = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, args, {
    cwd: scrapersDir,
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, ...netFlags]
        .filter(Boolean)
        .join(' '),
    },
    stdio: ['ignore', outStream, outStream],
    windowsHide: true,
  });

  const job: InternalJob = {
    id: jobId,
    vendor,
    mode,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    pid: child.pid ?? null,
    logFile,
  };
  jobsMap.set(jobId, job);

  child.on('close', (code) => {
    job.status = code === 0 ? 'completed' : 'failed';
    job.exitCode = code ?? null;
    job.endedAt = new Date().toISOString();
    try {
      fs.closeSync(outStream);
    } catch {
      // ignore
    }
  });

  child.on('error', (err) => {
    try {
      fs.appendFileSync(logFile, `\nProcess error: ${err.message}\n`);
      fs.closeSync(outStream);
    } catch {
      // ignore
    }
    job.status = 'failed';
    job.exitCode = -1;
    job.endedAt = new Date().toISOString();
  });

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      vendor: job.vendor,
      mode: job.mode,
      status: job.status,
      startedAt: job.startedAt,
      pid: job.pid,
    },
    jobs: serializeJobs(),
  });
}
