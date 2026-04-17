const esbuild = require("esbuild");
const fs      = require("fs");
const path    = require("path");
const { execSync } = require("child_process");

const watch   = process.argv.includes("--watch");
const release = process.argv.includes("--release");

// FoundryVTT globals — not bundled, resolved at runtime
const external = [
    "foundry",
    "game",
    "canvas",
    "ui",
    "Hooks",
    "JournalEntry",
    "JournalEntryPage",
    "ChatMessage",
    "ActiveEffect",
    "Dialog",
    "Roll",
    "Application",
    "FormApplication",
    "ItemPiles",
    "socketlib",
];

async function build(minify = true) {
    fs.rmSync("dist", { recursive: true, force: true });
    fs.mkdirSync("dist", { recursive: true });

    try {
        await esbuild.build({
            entryPoints: ["src/main.js"],
            outfile:     "dist/main.js",
            bundle:      true,
            format:      "esm",
            target:      "es2022",
            minify,
            external,
            logLevel:    "info",
        });

        fs.copyFileSync("module.json", "dist/module.json");
        for (const dir of ["assets", "packs", "languages", "styles", "templates"]) {
            if (fs.existsSync(dir)) {
                fs.cpSync(dir, `dist/${dir}`, { recursive: true });
            }
        }

        const size = (fs.statSync("dist/main.js").size / 1024).toFixed(1);
        console.log(`WITA | Build complete → dist/main.js (${size}kb, minify=${minify})`);
    } catch (e) {
        console.error("WITA | Build failed:", e.message);
        process.exit(1);
    }
}

if (watch) {
    esbuild.context({
        entryPoints: ["src/main.js"],
        outfile:     "dist/main.js",
        bundle:      true,
        format:      "esm",
        target:      "es2022",
        minify:      false,
        external,
        logLevel:    "info",
    }).then(ctx => {
        ctx.watch();
        console.log("WITA | Watching for changes (minify=false)...");
    });
} else if (release) {
    const version = require("./package.json").version;
    const zipName = `wita-v${version}.zip`;
    build(true).then(() => {
        if (fs.existsSync(zipName)) fs.rmSync(zipName);
        // Use PowerShell Compress-Archive (Windows) or zip (Linux/Mac)
        try {
            execSync(`powershell -Command "Compress-Archive -Path dist\\* -DestinationPath ${zipName} -Force"`, { stdio: "inherit" });
        } catch {
            execSync(`cd dist && zip -r ../${zipName} .`, { stdio: "inherit" });
        }
        console.log(`WITA | Release archive → ${zipName}`);
    });
} else {
    build(true);
}
