# ERG Viewer

ERG Viewer 是一个面向 OPTOPROBE Excel 导出文件的视觉电生理桌面分析工具。它把 ERG/FVEP 数据加载、波形查看、机器识别结果复核、手动标注、导出和复制整合在一个 Electron 应用里，适合实验室和临床科研场景下快速复核和整理记录。

## 核心能力

- 读取 OPTOPROBE 导出的 `.xlsx` / `.xls` 文件，并自动解析基本信息、左右眼分组和检测参数。
- 绘制左右眼波形，支持坐标范围调整、重置、单眼/双眼布局和主题切换。
- 支持 dRod、dMax、lCone 的 a/b 波手动标注，并与机器识别结果并排比较。
- 支持 dOps 的 Op1-Op5 波峰/波谷标注与 sum O 计算。
- 支持 lFlicker 的机器幅值/相位读取，以及基于波形的傅里叶分量重新计算。
- 支持 FVEP 的 N1/P1/N2/P2 机器结果展示和手动标注。
- 支持 PNG、SVG、PDF 图像导出，Excel 绘图数据导出，以及图像/数据复制到剪贴板。

## 开发运行

建议使用 `cnpm` 或其他可访问 npm 镜像的包管理器安装依赖。

```bash
cnpm install
cnpm run start
```

如果本机 `node` 环境异常，也可以先确认 `cnpm -v` 使用的是可运行的 Node。

## 质量检查

```bash
cnpm run check
cnpm run smoke -- /path/to/OPTOPROBE-export.xlsx
```

`smoke_parse.js` 只做命令行解析冒烟检查，不会启动 Electron。

## 打包

```bash
cnpm run build:mac
cnpm run build:win
cnpm run build:linux
```

推荐发布策略：

- GitHub 仓库只提交源码、配置、图标资源和文档。
- macOS `.dmg/.zip`、Windows `.exe`、Linux `.AppImage/.deb` 放到 GitHub Releases。
- Linux 包目前建议标注为实验支持，经过 Linux 真机验证后再作为正式稳定版本发布。

## 数据与隐私

OPTOPROBE 导出文件可能包含患者姓名、日期、医院、检查编号等敏感信息。仓库默认忽略 `.xlsx/.xls`，不要把原始检查文件提交到 GitHub。若需要示例数据，请只放置彻底匿名化文件到 `docs/examples/`。

## 架构说明

见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
