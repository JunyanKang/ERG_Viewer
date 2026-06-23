# ERG Viewer

[English](README_EN.md)

ERG Viewer 是面向 OPTOPROBE Excel 导出文件的视觉电生理桌面分析工具。它把 ERG/FVEP 数据加载、左右眼波形复核、机器识别结果比较、手动标注、图像导出和数据导出整合在一个 Electron 应用中，服务于眼科电生理实验、临床科研质控和文章图表整理。

## 功能概览

- 数据读取：导入 OPTOPROBE `.xlsx` / `.xls`，自动识别检查信息、左右眼分组和检测参数。
- 波形查看：左右眼并排或单眼显示，支持坐标范围调整、重置、主题切换。
- a/b 波复核：支持 dRod、dMax、lCone 的 a-wave / b-wave 手动标注，并与机器识别结果并排比较。
- Ops 分析：支持 dOps 的 Op1-Op5 波峰/波谷标注与 sum O 计算。
- Flicker 分析：读取机器幅值/相位，并基于波形重新计算傅里叶分量。
- FVEP 分析：展示 N1/P1/N2/P2 机器识别结果，并支持手动复核标注。
- Lab 实验分析：支持多文件导入、control/cko 等 cohort 自动推断、FERG/FVEP/dOps/Flicker 指标提取、分组均值/SEM 汇总和原始指标导出。
- Demo 展示：内置匿名 synthetic demo 数据，并提供脚本生成 OPTOPROBE 风格 Excel 示例文件。
- 导出共享：支持 PNG、SVG、PDF 图像导出，Excel 绘图数据导出，以及图像/数据复制到剪贴板。

## 目录结构

```text
ERG_Viewer/
├── assets/                  # 源图与非打包运行时素材
├── build/                   # electron-builder 资源：图标、Windows 附加文件
├── docs/                    # 架构、发布、实验分析、评审和示例数据
├── scripts/                 # 命令行工具：图标生成、Excel 解析冒烟测试、demo 数据生成
├── src/
│   ├── main/                # Electron main process
│   ├── preload/             # contextBridge / IPC API
│   └── renderer/            # React + Plotly renderer
├── package.json             # 依赖、脚本和 electron-builder 配置
└── README.md
```

仓库不会提交 `node_modules/`、`dist/` 或原始 Excel 检查文件。

## 开发环境

建议使用 `cnpm`，可以绕开部分 npm 网络问题：

```bash
cnpm install
cnpm run start
```

如果本机默认 `node` 损坏，可以先确认 `cnpm -v` 输出中的 Node 路径是否可用。

## 检查与冒烟测试

```bash
cnpm run check
cnpm run smoke -- /path/to/OPTOPROBE-export.xlsx
cnpm run gen:demo
```

`check` 进行 JavaScript 语法检查；`smoke` 只解析 Excel 并输出基本信息和分组摘要，不启动 Electron；`gen:demo` 生成匿名 synthetic Excel 示例到 `docs/examples/`。

## 实验分析与 Demo

顶部 `Lab` 入口用于实验级批量分析。进入 Lab 后可以：

- 点击 `Demo` 直接加载内置匿名 control/cko 示例。
- 点击 `Add files` 批量导入 OPTOPROBE Excel。
- 导出 raw metrics 或 cohort summary Excel。

示例数据可以通过以下命令重新生成：

```bash
cnpm run gen:demo
```

生成文件位于 `docs/examples/`，均为 synthetic 数据，不包含真实病人信息。

## 打包

```bash
cnpm run build:mac      # macOS dmg + zip
cnpm run build:win      # Windows NSIS exe
cnpm run build:linux    # Linux AppImage
cnpm run build:linux:deb # Optional Debian package
```

说明：

- macOS 正式分发需要 Apple Developer ID 签名和公证。
- Windows 正式分发建议配置代码签名证书。
- Linux AppImage 已配置为默认 Linux 产物；deb 包为可选补充，建议在 Linux 环境验证后发布。

## 发布策略

- GitHub 仓库：只放源码、配置、文档和必要构建资源。
- GitHub Releases：放 `.dmg`、`.zip`、`.exe`、`.AppImage` 等二进制安装包；`.deb` 可在 Linux 环境验证后补充。
- 版本标签采用 `vX.Y.Z`，与 `package.json` 的 `version` 保持一致。

## 数据与隐私

OPTOPROBE 导出文件可能包含患者姓名、检查编号、医院、日期等敏感信息。仓库默认忽略 `.xlsx/.xls`，不要提交原始检查文件。若需要示例数据，只能放彻底匿名化文件到 `docs/examples/`。

## 技术文档

- [架构说明](docs/ARCHITECTURE.md)
- [发布清单](docs/RELEASE.md)
- [实验分析设计](docs/EXPERIMENT_ANALYSIS.md)
- [三角色评审门](docs/REVIEW_GATE.md)
