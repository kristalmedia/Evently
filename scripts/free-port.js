// Runs automatically before `npm run dev` (see package.json "predev").
// Kills whatever process is already listening on the dev port so `next dev`
// always binds to it instead of silently falling back to another port —
// which breaks Microsoft Entra ID sign-in since the OAuth redirect URI is
// registered against a fixed port in Azure Portal.
const { execSync } = require("child_process");

const PORT = process.env.DEV_PORT || 3000;

try {
  const output = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  const pids = new Set();
  for (const line of output.split("\n")) {
    if (!line.includes(`:${PORT} `) || !line.toUpperCase().includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`[predev] Freed port ${PORT} (killed stale process ${pid})`);
    } catch {
      // Already gone, or no permission — safe to ignore.
    }
  }
} catch {
  // netstat unavailable or nothing found on the port — nothing to do.
}
