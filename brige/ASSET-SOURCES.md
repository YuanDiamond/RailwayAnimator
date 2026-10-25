# Minecraft 原版预览资产

- 版本：Minecraft Java 1.21.4
- 版本清单：https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
- 客户端：https://piston-data.mojang.com/v1/objects/a7e5a6024bfd3cd614625aa05629adf760020304/client.jar
- 官方客户端 SHA-1：`a7e5a6024bfd3cd614625aa05629adf760020304`
- 本地下载 SHA-1：`a7e5a6024bfd3cd614625aa05629adf760020304`，一致。
- `assets.js`：58 个方块状态定义、151 个递归模型、51 张原版 PNG 纹理，共 82,670 字节。
- `asset-sha1.json`：每个原始 JSON / PNG 条目的 SHA-1，可核验未改动的源资源。
- 提取脚本：`extract_assets.py`。`client-1.21.4.jar` 仅为提取暂存，不应放入网站。

模型和纹理版权归 Mojang AB / Microsoft。仅提取本工具展示桥梁所需的资源；本工具不是 Minecraft 官方产品。网站宜保留简短的资产版权来源说明。

## JavaScript 数据契约

`window.MinecraftAssets = {blockstates, models, textures, source}`。

- `blockstates` 键为不带命名空间的方块名，例如 `iron_bars`。
- `models` 键标准化为 `minecraft:block/...`；内部原始引用可能带或不带命名空间。
- `textures` 键标准化为 `minecraft:block/...`，值为完整 PNG data URL，可离线加载。
- `source` 包括版本、官方客户端下载 URL、校验值和版权文字。

## 渲染要点

1. 先递归合并模型 `parent`；子模型 `textures` 覆盖父模型相同键，继承父模型 `elements`，除非子模型明确提供 `elements`。材质变量 `#all` / `#side` / `#texture` 需要递归解析。
2. `blockstates.variants` 按状态组合匹配；本桥没有随机材质需求，数组可固定选择第一项。`multipart` 独立评估每个 `when` 并合并所有匹配的 `apply`。没有 `when` 的项始终应用。
3. blockstate 的 `x` / `y` 为围绕方块中心 `[8,8,8]` 的旋转；还需支持单个 element 的 `rotation`。当前资产中杠杆以 X 轴 ±45° 旋转，灯笼链条平面以 Y 轴 45° 旋转。
4. `from` / `to` 和 UV 坐标范围为 0–16；零厚度 element 是正常模型。PNG 透明部分必须保留并使用 alpha cutout，不能用不透明盒子代替。UV 可倒序，face rotation 有 0/90/180/270°。
5. cube 等少数父模型的面没有显式 `uv`，须按 vanilla face default UV 规则根据 from/to 推导。其余模型绝大部分提供显式 UV。
6. 含动画的纵向 texture strip，可先显示第一张方形帧；NEAREST 过滤保持像素边缘。所有纹理直接来自客户端，未手工重绘。

## 铁栏杆模型的纠错重点

`iron_bars` 使用原版 multipart：`iron_bars_post_ends` 始终显示；四向全不连时才显示 `iron_bars_post`。单向连接时加入 cap/cap_alt。北/东连接使用 side（东转 Y=90°），南/西连接使用 side_alt（西转 Y=90°）。

side 主体是从中心到方块边缘的**零厚度竖向双面透明纹理平面**，高度16；不是木栅栏那样一根粗立柱加两根实体横梁。顶部和底部另有极薄边缘平面（Y=0.001 / 15.999）。正确处理透明PNG、双向面及条件连接后，直行和L形转角会自然呈现游戏内的窄铁栏杆。
