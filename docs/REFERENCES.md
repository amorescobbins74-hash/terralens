# 前沿方向调研与实现选择

检索时间：2026-09-09 至 2026-09-10。资料来自项目官方仓库 / 文档，未按搜索结果的营销文案推定能力。

| 参考 | 查到的能力 | 本项目借鉴 |
| --- | --- | --- |
| [GeoAI.js](https://github.com/decision-labs/geoai.js) | 浏览器 WebGPU / WASM 推理，圈选区域、地理要素输出、Worker 流程；浏览器中确认 2026 年仍有更新 | 浏览器端工作台、后台处理、结果导出流程。未集成其 AI 模型 |
| [opengeos/GeoAI](https://github.com/opengeos/geoai) | Python 地理 AI 框架、影像获取、模型训练 / 推理和基础模型接口 | 用于比较真正 GeoAI 的技术边界，不宣称已实现其能力 |
| [Element 84 Earth Search](https://github.com/Element84/earth-search) | STAC 公开时空目录与云端影像资产链接 | 实际接入的数据发现与资产读取 |
| [GeoTIFF.js](https://github.com/geotiffjs/geotiff.js) | JavaScript TIFF 解析、窗口读取、取消支持 | 实际依赖，读取 COG 数据块 |

选择“云原生地表变化证据工作台”的原因：比单张交互地图有更完整的技术深度，又可以不依赖付费 API、GPU 后端或模型授权，做出真实可运行的作品。前沿性主要体现在端侧地理计算与云原生数据流；科学分析方法采用透明、可解释的基线。

本项目独立编写工作台和分析代码，没有整仓复制参考项目。参考项目自身的功能、成熟度和模型精度不等同于本项目。

有关反射率偏移的依据：[Earth Search 的 Gain / Offset 说明](https://github.com/Element84/earth-search#gainoffset-in-items-after-jan-25-2022)。读取各波段 `raster:bands` 的 scale 和 offset，缺少这些关键字段时停止，不猜测默认值。
