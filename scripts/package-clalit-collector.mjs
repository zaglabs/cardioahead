import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const cwd = process.cwd(),
  base = path.resolve(cwd, ".collector-dist");
await fs.mkdir(base, { recursive: true });
const output = await fs.mkdtemp(path.join(base, "build-")),
  root = path.join(output, "CardioAhead-Collector-Windows");
await fs.mkdir(path.join(root, "runtime"), { recursive: true });
const executable = process.argv[2];
if (
  !executable ||
  !path.isAbsolute(executable) ||
  path.basename(executable).toLowerCase() !== "node.exe"
)
  throw Error("EXPLICIT_NODE_EXECUTABLE_REQUIRED");
await fs.copyFile(executable, path.join(root, "runtime", "node.exe"));
const scripts = [
  "clalit-app.mjs",
  "clalit-collector-runtime.mjs",
  "clalit-collector-page.mjs",
  "clalit-import-bridge.mjs",
  "clalit-import-state.mjs",
  "clalit-bridge-status.mjs",
  "clalit-navigation.mjs",
  "clalit-table-reader.mjs",
  "clalit-structure.mjs",
];
await fs.mkdir(path.join(root, "scripts"), { recursive: true });
for (const file of scripts)
  await fs.copyFile(
    path.join(cwd, "scripts", file),
    path.join(root, "scripts", file),
  );
await fs.mkdir(path.join(root, "src", "lib", "medical-import"), {
  recursive: true,
});
await fs.copyFile(
  path.join(cwd, "src/lib/medical-import/schema.mjs"),
  path.join(root, "src/lib/medical-import/schema.mjs"),
);
await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
await fs.cp(
  path.join(cwd, "node_modules/playwright-core"),
  path.join(root, "node_modules/playwright-core"),
  {
    recursive: true,
    filter: (source) => !source.includes(path.sep + ".local-browsers"),
  },
);
const license = await fetch(
  "https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE",
  { redirect: "error", signal: AbortSignal.timeout(20000) },
);
if (!license.ok) throw Error("NODE_LICENSE_UNAVAILABLE");
await fs.writeFile(
  path.join(root, "runtime", "NODE-LICENSE.txt"),
  await license.text(),
);
await fs.writeFile(
  path.join(root, "Start CardioAhead.cmd"),
  [
    "@echo off",
    'cd /d "%~dp0"',
    "powershell.exe -NoProfile -WindowStyle Hidden -Command \"$taskRoot = (Get-Location).Path; Start-Process -FilePath (Join-Path $taskRoot 'runtime\\node.exe') -ArgumentList @('scripts/clalit-app.mjs') -WorkingDirectory $taskRoot -WindowStyle Hidden\"",
    "",
  ].join("\r\n"),
);
await fs.writeFile(
  path.join(root, "Read me.html"),
  '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>CardioAhead</title><style>body{font:21px/1.9 Arial;max-width:900px;padding:35px;margin:auto;color:#234536}h1{font-size:32px}</style><h1>ייבוא מכללית — CardioAhead</h1><ol><li>חלצו את התיקייה למחשב Windows שבו מותקן Chrome.</li><li>פתחו את הקובץ <b dir="ltr">Start CardioAhead</b>.</li><li>בקישור ההזמנה שקיבלתם מהמרפאה, בחרו בייבוא מכללית, אשרו את ההסכמה ולחצו על פתיחת החיבור.</li><li>התחברו לכללית בעצמכם ובחרו את הפרופיל שלכם. חזרו לחלון האספן, אספו את הרשומות ובדקו את המקורות לפני ייבוא.</li></ol><p>אין להזין סיסמה או קוד כללית באתר CardioAhead. האיסוף חלקי והמסמכים המקוריים נשארים בכללית.</p><hr><div lang="en" dir="ltr"><h1>CardioAhead Clalit import</h1><ol><li>Extract this folder on a Windows computer with Chrome installed.</li><li>Open <b>Start CardioAhead</b>.</li><li>In your clinic invitation choose Clalit import, approve the consent and open the connection.</li><li>Sign into Clalit yourself and select your own profile. Return to the collector, collect supported records, then review before importing.</li></ol><p>The first setup may need help from the clinic or a family member. This is a limited desktop pilot, not a phone integration. Your Clalit password and login codes are never entered into CardioAhead. Original documents remain in Clalit.</p></div>',
);
const manifest = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else {
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (
        /(^|\/)(?:\.env|\.git|state\.json|storage-state\.json|test-results|tmp)(?:[/.]|$)/i.test(
          relative,
        ) ||
        (!relative.startsWith("node_modules/playwright-core/") &&
          /(^|\/)cookies(?:[/.]|$)/i.test(relative))
      )
        throw Error("FORBIDDEN_DISTRIBUTION_FILE");
      const bytes = await fs.readFile(absolute);
      manifest.push({
        path: relative,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
await walk(root);
await fs.writeFile(
  path.join(root, "manifest.json"),
  JSON.stringify(
    {
      version: "0.2.0",
      runtime: "Node.js 24.19.0",
      platform: "Windows x64; installed Google Chrome",
      files: manifest,
    },
    null,
    2,
  ),
);
await fs.writeFile(
  path.join(base, "latest.json"),
  JSON.stringify({ root, output, files: manifest.length }),
);
console.log(
  JSON.stringify({
    output,
    root,
    file_count: manifest.length,
    medical_records_included: false,
    credentials_included: false,
  }),
);
