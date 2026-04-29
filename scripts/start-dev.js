// Wrapper that loads .env.local with override-on, then spawns `next dev`.
// Keeps the dev server immune to shadowing env vars in the parent shell
// (e.g. an empty ANTHROPIC_API_KEY left in a session). Cross-platform —
// works in cmd, PowerShell, and bash.

const { spawn } = require("node:child_process");
const path = require("node:path");

require("dotenv").config({ path: ".env.local", override: true });

// Windows needs shell:true to invoke .cmd shims that npm installs into
// node_modules/.bin. POSIX is fine with shell:false.
const isWindows = process.platform === "win32";
const next = spawn(
  isWindows ? "next.cmd" : "next",
  ["dev"],
  {
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
    cwd: process.cwd(),
  },
);

next.on("exit", (code) => process.exit(code ?? 0));
