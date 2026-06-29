# ERG Viewer

[English](README_EN.md)

ERG Viewer 是面向 OPTOPROBE Excel 导出文件的视觉电生理桌面分析工作站。它把 ERG/FVEP 数据加载、单样本波形复核、机器识别结果比较、人工修正、批量分组、统计分析、图像导出和源数据导出整合在一个 Electron 应用中，服务于眼科电生理实验、临床科研质控和文章图表整理。

## 功能概览

- 数据读取：导入 OPTOPROBE `.xlsx` / `.xls`，自动识别检查信息、左右眼分组和检测参数。
- 波形查看：左右眼并排或单眼显示，支持坐标范围调整、重置、主题切换。
- a/b 波复核：支持 dRod、dMax、lCone 的 a-wave / b-wave 手动标注，并与机器识别结果并排比较。
- Ops 分析：支持 dOps 的 Op1-Op5 波峰/波谷标注与 sum O 计算。
- Flicker 分析：读取机器幅值/相位，并基于波形重新计算傅里叶分量。
- FVEP 分析：展示 N1/P1/N2/P2 机器识别结果，并支持手动复核标注。
- v2 实验工作流：支持 Intake / Review / Analysis / Report 四个工作区，覆盖项目新建、项目保存/导入、批量导入、cohort 分组、单记录 raw/manual/corrected 校正、分组作图、统计检验和完整项目导出。
- 指标体系：FERG 支持 a-wave/b-wave latency、amplitude、b/a ratio；FVEP 支持 N1/P1/N2/P2 latency、amplitude 和 P1-N1、P1-N2、P2-N2 peak-to-peak amplitude；dOps 支持 summed OP amplitude；Flicker 支持机器 amplitude/phase 与波形 Fourier 重算 amplitude/phase。
- 统计分析：两组默认 Welch t-test，多组默认 one-way ANOVA，并支持 Mann-Whitney、Kruskal-Wallis、效应量和 Benjamini-Hochberg FDR。
- 产品级多语言：中文、英文、俄文、拉丁文、法文、德文界面切换，语言状态持久化，About 页面随语言切换并显示版本号。
- Demo 展示：内置匿名 synthetic demo 数据，并提供脚本生成 OPTOPROBE 风格 Excel 示例文件。
- 导出共享：支持 PNG、SVG、PDF 图像导出，Excel 绘图数据导出，以及图像/数据复制到剪贴板。

## 目录结构

```text
ERG_Viewer/
├── assets/                  # 源图与非打包运行时素材
├── build/                   # electron-builder 资源：图标、Windows 附加文件
├── docs/                    # 架构、发布、实验分析、评审和示例数据
├── scripts/                 # 命令行工具：图标生成、Excel 解析冒烟测试、demo 数据生成
├── src-v2/
│   ├── main/                # Electron main process
│   ├── preload/             # contextBridge / IPC API
│   └── renderer/            # React + Plotly renderer and core analysis modules
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

仓库根目录的 `.npmrc` 已经把 `registry` 指向 `https://registry.npmmirror.com`，所以直接 `npm install` / `pnpm install` 也会走镜像；`cnpm` 行为不变。

> **注意 lockfile 一致性**：`cnpm` 与 `npm` 生成的 `package-lock.json` 格式不互通，混用会导致冲突。请团队统一只用 `cnpm install`（CI 也已经统一走 cnpm），避免 PR 互相覆盖 lockfile。

## 检查与冒烟测试

```bash
cnpm run check
cnpm run smoke -- /path/to/OPTOPROBE-export.xlsx
cnpm run gen:demo
```

`check` 进行 JavaScript 语法检查；`smoke` 只解析 Excel 并输出基本信息和分组摘要，不启动 Electron；`gen:demo` 生成匿名 synthetic Excel 示例到 `docs/examples/`。

## 实验分析与 Demo

v2 顶部工作流用于实验级分析。进入工作站后可以：

- 在 `Intake` 批量导入 OPTOPROBE Excel，并设置 cohort 分组、纳入/排除和统计设计。
- 在 `Review` 查看单个 acquisition record 的 raw/manual/corrected 波形和校正后指标。
- 在 `Analysis` 工作区选择指标、刺激条件、眼别、raw/corrected 版本和统计方法，生成分组图与统计结果；ERG/FVEP 统计不会混合不同刺激强度或信号条件。
- 在 `Report` 工作区导出 samples、groups、metrics_raw、metrics_corrected、stats、figure_source 和 corrections_log。
- 通过顶部 `Save Project / Open Project` 管理 `.ep` 项目文件，完整恢复样本、分组、纳入/排除、校正和分析设置；旧 `.ergproject` 文件仍可读取。

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
