# Minecraft Java 26.3 杨木资源

- 官方发布说明：https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3
- 官方版本清单：https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
- 官方26.3版本元数据：https://piston-meta.mojang.com/v1/packages/61fff1316bd50312624a858bbb5eb18fa45208ed/26.3.json
- 官方客户端：https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar
- 官方客户端 SHA-1：`e877b6a07acd633fb3bb475002175cec036e7b87`，与本地下载一致。
- DataVersion：**5023**。直接来自官方客户端根目录 `version.json` 的 `world_version`，不是根据第三方页面推断。原始内容保存为 `official-version.json`。

## 交付

`poplar-assets.js` 可在现有 `assets.js` 之后通过普通script标签加载：将4个blockstates、16个递归模型、3张PNG合并到 `window.MinecraftAssets`，并追加 `poplarSource`。总大小7,829字节，不需要联网。

`poplar-assets.json` 是同一内容的纯JSON，供构建期合并。

`asset-sha1.json` 记录所有原始模型/纹理内容的SHA-1。`extract_poplar.py` 可重现提取；客户端JAR只作暂存，不要发布到网站。

与原1.21.4模型相比，共享资源只有 `minecraft:block/block` 改变：新增 `display.on_shelf`，无几何或材质变化。可以直接Object.assign合并；不会改变已有方块在世界中的预览。

## 精确方块与状态

| 方块ID | 属性 |
|---|---|
| `minecraft:poplar_planks` | 无 |
| `minecraft:poplar_log` | `axis`: x / y / z |
| `minecraft:poplar_slab` | `type`: bottom / top / double；`waterlogged`: true / false |
| `minecraft:poplar_fence` | `north/east/south/west/waterlogged`: true / false |

type/axis/四向连接直接由官方blockstates文件确认。waterlogged不影响视觉，故blockstates没有单独渲染变体；已读取官方客户端 `SlabBlock.createBlockStateDefinition` 与 `FenceBlock.createBlockStateDefinition` 的字节码，确认其分别将 TYPE+WATERLOGGED、NORTH+EAST+WEST+SOUTH+WATERLOGGED 添加到状态定义。读取结果保存在 `official-state-definition-fields.json`，脚本为 `inspect_state_fields.py`。

`poplar-state-schema.json` 提供便于测试消费的属性枚举。

模型和纹理 © Mojang AB / Microsoft。本工具不是 Minecraft 官方产品。
