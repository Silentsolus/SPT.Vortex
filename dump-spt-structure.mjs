#!/usr/bin/env node
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

function toPosix(p) { return p.split(path.sep).join("/"); }

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function walk(root, relBase = "", maxDepth = 12) {
  const outFiles = [];
  const outDirs = [];
  const stack = [{ abs: root, rel: relBase, depth: 0 }];

  while (stack.length) {
    const cur = stack.pop();
    if (cur.depth > maxDepth) continue;

    let entries;
    try {
      entries = await fsp.readdir(cur.abs, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const abs = path.join(cur.abs, ent.name);
      const rel = cur.rel ? path.join(cur.rel, ent.name) : ent.name;

      // Skip very noisy folders if they ever appear in staging
      const lower = ent.name.toLowerCase();
      if (ent.isDirectory() && (lower === "node_modules" || lower === ".git")) continue;

      if (ent.isDirectory()) {
        outDirs.push(toPosix(rel));
        stack.push({ abs, rel, depth: cur.depth + 1 });
      } else if (ent.isFile()) {
        let size = null;
        try { size = (await fsp.stat(abs)).size; } catch {}
        outFiles.push({ rel: toPosix(rel), size });
      }
    }
  }
  outDirs.sort();
  outFiles.sort((a, b) => a.rel.localeCompare(b.rel));
  return { dirs: outDirs, files: outFiles };
}

function isUnder(relPosix, prefixPosix) {
  return relPosix === prefixPosix || relPosix.startsWith(prefixPosix + "/");
}

async function main() {
  const args = process.argv.slice(2);
  const rootArg = args[0];

  // Default staging folder for SPT in Vortex
  const defaultRoot = path.join(process.env.APPDATA || "", "Vortex", "eftsptaki", "mods");
  const root = rootArg ? path.resolve(rootArg) : defaultRoot;

  const maxDepthIdx = args.findIndex(a => a === "--maxDepth");
  const maxDepth = maxDepthIdx >= 0 ? Number(args[maxDepthIdx + 1] || "12") : 12;

  if (!await exists(root)) {
    console.error("Root does not exist:", root);
    process.exit(2);
  }

  const top = await fsp.readdir(root, { withFileTypes: true });
  const modFolders = top.filter(e => e.isDirectory()).map(e => e.name).sort();

  const report = {
    generated_at: new Date().toISOString(),
    root,
    max_depth: maxDepth,
    mods: []
  };

  const treeLines = [];
  treeLines.push(`Root: ${root}`);
  treeLines.push(`Mods: ${modFolders.length}`);
  treeLines.push("");

  for (const folder of modFolders) {
    const modRoot = path.join(root, folder);
    const walked = await walk(modRoot, "", maxDepth);

    // Extract “signals” we care about for matching:
    // - client: BepInEx/plugins/*.dll
    // - server: user/mods/*/package.json
    const dlls = walked.files
      .map(f => f.rel)
      .filter(r => isUnder(r, "BepInEx/plugins") && r.toLowerCase().endsWith(".dll"));

    const packageJsons = walked.files
      .map(f => f.rel)
      .filter(r => r.toLowerCase().endsWith("/package.json") && isUnder(r, "user/mods"));

    report.mods.push({
      folder,
      client_dlls: dlls,
      server_package_jsons: packageJsons,
      dirs: walked.dirs,
      files: walked.files
    });

    treeLines.push(folder);
    for (const d of dlls) treeLines.push(`  DLL  ${d}`);
    for (const p of packageJsons) treeLines.push(`  PKG  ${p}`);
    treeLines.push("");
  }

  await fsp.writeFile("structure.json", JSON.stringify(report, null, 2), "utf8");
  await fsp.writeFile("tree.txt", treeLines.join("\n"), "utf8");

  console.log("Wrote structure.json and tree.txt");
  console.log("Next: zip them and upload.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
