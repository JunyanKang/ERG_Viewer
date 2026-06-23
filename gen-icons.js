// scripts/gen-icons.js
const fs = require("fs");
const path = require("path");
const png2icons = require("png2icons");

const src = path.resolve(process.argv[2] || "icon.png"); // 1024x1024 PNG
const outDir = path.resolve(process.argv[3] || "build");

// 读取源图
const input = fs.readFileSync(src);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 生成 .icns（Retina 尺寸自动内含 16~1024）
const icns = png2icons.createICNS(input, png2icons.BICUBIC, 0, false);
fs.writeFileSync(path.join(outDir, "icon.icns"), icns);

// 生成 .ico（包含 16/32/48/64/128/256）
const ico = png2icons.createICO(input, png2icons.BICUBIC, 0, false, true);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico);

console.log("✓ Generated:", path.join(outDir, "icon.icns"), path.join(outDir, "icon.ico"));