# 版本适配记录：DSH 0.1.5-rc.3 → 0.1.7-rc.1

本文件记录 `amap-trip` 为适配 DSH `0.1.7-rc.1` 所做的改动、验证方式与回退办法。
上游基线是备份里的 `0.1.4`；本次适配后版本号为 **`0.1.5`**。
（其后 `0.1.6` 在此之上修复了走廊类别标签漂移问题，见仓库 `CHANGELOG.md`。）

## 一、为什么需要适配

`0.1.7-rc.1` 没有改动本插件用到的工具注册契约（逐项核对见第三节）。需要改的是
**插件与宿主之间的依赖声明**，而且这次是实打实的坑：

1. **linked 插件的解析规则变了。** 官方文档（`docs/user/develop/basic/publish.md`）在
   0.1.7-rc.1 里新增了一整段：

   > A linked checkout keeps its own `node_modules`. Declare dsh packages whose instances
   > the plugin must share with the host under both `peerDependencies` and
   > `devDependencies` … A nearer physical package wins before a higher peer declaration.

   也就是说：linked 插件目录下**放着的** `node_modules` 优先级高于 peer 声明。
   本插件原来的做法恰好相反——`node_modules/@deepseek-ai/schemastery` 是一条指向
   `/home/<user>/.npm/_npx/<hash>/node_modules/@deepseek-ai/schemastery` 的绝对软链。
   两个问题：
   - `<hash>` 是 npx 缓存的内容哈希，DSH 换一次安装就变（本机已经换过一轮，
     旧目录 `c8633a242642d858` 是上一版留下的）；
   - 它会把宿主的 schemastery 挡在外面，插件拿到的是**另一份实例**（当时是 3.18.2，
     宿主已是 3.18.4），`Config` 的校验收不到内核那一侧的统一行为。

2. **兼容性预检**（`@deepseek-ai/dsh-app-boot`）：启动/安装时 `evaluatePluginCompatibility()`
   读 `@deepseek-ai/dsh*` 的 `peerDependencies` 与运行版本比对，不匹配就禁用该行并提示
   `dsh plugin allow-version`。`dsh.engines` 这类自造字段它不认。

## 二、改动清单

### `package.json`

| 改动 | 原因 |
| --- | --- |
| `version` 0.1.4 → 0.1.5 | 预检按 `name@version` 记录豁免，必须换版本号 |
| 新增 `peerDependencies["@deepseek-ai/schemastery"] = "~3.18.4"` | 按新规则让运行时用**宿主那一份**；范围与 DSH 0.1.7-rc.1 自身对 schemastery 的要求一致 |
| 新增 `devDependencies["@deepseek-ai/schemastery"] = "~3.18.4"` | 官方约定的成对声明：dev 侧供独立测试/类型检查 |
| 新增 `peerDependencies["@deepseek-ai/dsh"] = ">=0.1.5-rc.2"` | 接入兼容性预检；下限取真实可用过的最低版本 |
| 新增 `devDependencies["@deepseek-ai/dsh"] = "0.1.7-rc.1"` | 同上，成对声明 |
| `files` 补 `README.md` | 本次补了 README，顺手进发布清单 |

### 删除 `node_modules/`

整个 `node_modules/` 目录被删除，其中只有那一条指向 npx 缓存的
`@deepseek-ai/schemastery` 软链。删除后 `import Schema from '@deepseek-ai/schemastery'`
由 DSH 0.1.7-rc.1 的 peer 解析接管，指向安装自带的实例。

> 直接证据：适配后从插件目录执行裸 `node -e "import('@deepseek-ai/schemastery')"`
> 仍然报 `ERR_MODULE_NOT_FOUND`（说明 Node 自身解析不到），但插件在真实
> 0.1.7-rc.1 进程里加载成功、10 个工具全部注册——只能是 loader 的 peer 拦截在起作用。

### `README.md`

新增（本插件此前没有 README）：安装、key 准备、配置项表、产物说明、更新日志。

### 未改动

`index.mjs` / `core.mjs` / `corridor.mjs` / `prefs.mjs` / `map-html.mjs` /
`presets/*.json` / `cordis.patch.yml` **逐字节未改**。

## 三、逐项核对过、确认无需改动的契约

| 用到的能力 | 0.1.5-rc.3 → 0.1.7-rc.1 |
| --- | --- |
| `export const inject = ['tools']` | 服务名与语义未变 |
| `ctx.tools.register({name, description, parameters, output:{schema,render}, execute})` | `ToolDefinition` 未变；新增的是可选 `projectContent` / `deferLoading` / `timeoutMs`，属加法 |
| `parameters` 的 JSON Schema 子集 | `assertSupportedJsonSchema` 未变 |
| `output.render(args, value) → ContentBlock[]` | 未变 |
| `execute(args, exec)` 的 `exec.signal` 透传 | `ToolRunContext` 未变（仅新增可选 `schema`） |
| `export const Config = Schema.object({...})`（Schemastery） | cordis 4.0.2→4.0.4 的 config 解析未变；schemastery 3.18.2→3.18.4 无破坏性变更 |
| `ctx.get('sessionSkillCatalog')` 等（本插件未用） | — |

## 四、验证方式（全部在 DSH 0.1.7-rc.1 上跑）

1. **真实进程内探针**：用 npm 装的 `@deepseek-ai/dsh@0.1.7-rc.1` 起独立 `DSH_HOME`
   （工作区内）＋ web profile（`cordis.patch.yml` 里按包名插入本插件），探针插件核对：
   - 10 个工具**全部**出现在 `ctx.tools.get()` 视野里（`amap_diagnose / geocode / route /
     corridor / map / poi / traffic / weather / mode / pref`）；
   - 取 `amap_geocode` 的定义，`description` / `parameters` / `output.schema` /
     `output.render` / `execute` 五件套齐全，`parameters.properties` 为 `{address, city}`。
2. **组合校验**：`dsh --profile web --dump-config` 能看到 `# == amap-trip` 层与
   本插件插入行（含 `envFile` 配置）。
3. **兼容性预检**：把 `@deepseek-ai/dsh` 的 peer 范围临时改成 `0.1.4`，启动时如期出现
   `dsh: disabling profile plugin row "amap-trip": Plugin amap-trip@0.1.5 is incompatible with dsh 0.1.7-rc.1 …`，
   改回后消失。

## 五、安装与回退

```bash
# 1) 软链进 profile
ln -s /abs/path/to/amap-trip ~/.dsh/profiles/web/node_modules/amap-trip
# 2) profile 的 cordis.patch.yml 里插入（路径按需改）
```

```yaml
- insert:
    - id: amap-trip
      name: 'amap-trip'
      config:
        envFile: '/home/<you>/.dsh/.env'
```

或者以 `link:` 依赖装：`cd ~/.dsh/profiles/web && pnpm add link:/abs/path/to/amap-trip`。
**装完重启 DSH**（补丁层需要重新组合）。

回退：恢复 `node_modules/@deepseek-ai/schemastery` 软链与 `0.1.4` 的 `package.json`
即可（但在 0.1.7-rc.1 上会继续用第二份 schemastery，不推荐）。
