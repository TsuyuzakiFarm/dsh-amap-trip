# 版本适配记录：DSH 0.1.5-rc.3 → 0.1.7-rc.1

> **本文件含两轮适配。** 第一轮（0.1.5-rc.3 → 0.1.7-rc.1）保留原样；
> 第二轮（**从文件末的「第二轮适配：DSH 0.2.0-rc.2 → 0.2.1-alpha.1」起**）见第六节及其后。

本文件记录 `amap-trip` 为适配 DSH `0.1.7-rc.1` 所做的改动、验证方式与回退办法。
上游基线是备份里的 `0.1.4`；本次适配后版本号为 **`0.1.5`**。
（其后 `0.1.6` 在此之上修复了走廊类别标签漂移问题，见仓库 `CHANGELOG.md`。）
（再往后的 **`0.1.7`** 是一轮审计驱动的安全与健壮性修复，**不涉及 DSH 契约变更**，同样见 `CHANGELOG.md`。）

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

---

# 第二轮适配：DSH 0.2.0-rc.2 → 0.2.1-alpha.1

本次适配后版本号为 **`0.1.8`**（`0.1.7` → `0.1.8`）。上面第一轮的记录保留原样。

## 六、为什么需要适配：schemastery 被 DSH 自己升级了

`0.2.1-alpha.1` 没有改动本插件用到的工具注册契约（逐项核对见第八节）。真正需要改的是
**一条依赖声明**，而且它正是第一轮那个坑的续集：

DSH 自己声明的 `@deepseek-ai/schemastery` 版本**跟着 DSH 版本走**：

| DSH | 自带的 schemastery |
| --- | --- |
| `0.2.0-rc.2`（本机当前） | `3.18.4` |
| `0.2.1-alpha.1`（本次目标） | **`3.18.5-alpha.1`** |

本插件第一轮按当时宿主的版本声明了 `peerDependencies["@deepseek-ai/schemastery"] = "~3.18.4"`。
到了 0.2.1，这个范围**不再覆盖宿主实例的版本**：

```
3.18.5-alpha.1  satisfies  ~3.18.4   →  default=false, includePrerelease=true 才成立
```

也就是说 `pnpm` 的默认语义下 `~3.18.4` **不包含** `3.18.5-alpha.1`。声明与事实不符，
而第一轮的教训正是"声明错了会让插件落到第二份实例上"。

### 运行时到底拿到哪一份？——实测，不靠推断

为了不猜，我做了对照实验：在工作区里起一个隔离的 DSH 0.2.1-alpha.1 `DSH_HOME`，
放两个**除了 peer 范围以外完全相同**的探针插件（一个声明 `~3.18.5-alpha.1`、
一个声明 `~3.18.4`），profile 的 `node_modules` 里故意放**旧的 3.18.4**，
宿主的 `node_modules` 里是 **3.18.5-alpha.1**：

```
[probe] probe-new range=~3.18.5-alpha.1 -> version=3.18.5-alpha.1 @ <dsh 安装根>/node_modules/@deepseek-ai/schemastery
[probe] probe-old range=~3.18.4         -> version=3.18.5-alpha.1 @ <dsh 安装根>/node_modules/@deepseek-ai/schemastery
```

结论有两条，都很重要：

1. **解析由 DSH 的路由接管，且一律落到宿主安装自带的那一份**——与 peer 范围字符串写什么
   **无关**，也与 profile 自己的 `node_modules` 里有没有 schemastery 无关。
   （注：探针**必须先声明** `peerDependencies`，否则裸导入根本不进路由，直接
   `ERR_MODULE_NOT_FOUND`。DSH 只路由"已声明"的依赖。）
2. 因此 `~3.18.4` 在 0.2.1 下**不会**导致运行期拿到 3.18.4——但它会让
   `pnpm`／读者／将来的工具得到一个**与事实不符**的声明。修它，是为了让声明说真话。

### 改动清单

#### `package.json`

| 改动 | 原因 |
| --- | --- |
| `version` 0.1.7 → 0.1.8 | 兼容性预检的豁免按 `name@version` 记账，换运行期就换版本号 |
| `peerDependencies["@deepseek-ai/schemastery"]` `~3.18.4` → `~3.18.4 \|\| ~3.18.5-alpha.1` | 同时覆盖 0.2.0-rc.2（3.18.4）与 0.2.1-alpha.1（3.18.5-alpha.1）；单一范围做不到——`~3.18.4` 默认不含预发布版 `3.18.5-alpha.1`，`~3.18.5-alpha.1` 又排除了 `3.18.4`（`>=3.18.5-alpha.1`） |
| `devDependencies["@deepseek-ai/schemastery"]` 同上 | 官方约定的成对声明；dev 侧供独立测试/类型检查 |
| `devDependencies["@deepseek-ai/dsh"]` `0.1.7-rc.1` → `0.2.1-alpha.1` | dev 侧与运行期同版本；peer 侧 `>=0.1.5-rc.2` 不动 |

> 为什么不是直接写 `~3.18.5-alpha.1`：那会把还在用 0.2.0-rc.2 的部署判成不满足。
> 用 union 是唯一既不撒谎、又不断旧版本的写法。已验证：
> `3.18.4` ✓、`3.18.5-alpha.1` ✓、`3.18.5` ✓、`3.19.0` ✗（都不需要 `includePrerelease`）。

#### `scripts/dsh-resolve.mjs`（新增，开发期解析垫片）

第一轮的记录里写着"从插件目录执行裸 `node -e "import('@deepseek-ai/schemastery')"`
仍报 `ERR_MODULE_NOT_FOUND`（属预期）"。这没错，但它意味着**本包自己的测试脚本在
DSH 之外根本跑不起来**——`test-plugin.mjs` / `test-prefs.mjs` / `verify-fixes.mjs` /
`check-outdir.mjs` / `check-abort.mjs` 都要 `import '../plugin/index.mjs'`。

新增的垫片用 Node 的 `module.registerHooks()` 复刻 DSH 的路由行为：**只在常规解析失败、
且说明符是 `@deepseek-ai/*` 时**，把解析锚点换成 DSH 安装根（`$DSH_INSTALL_ROOT`，或从
本文件向上自动定位）再试一次。常规解析成功的导入一律原样放行。

它**不**用本地 `node_modules/` 软链——那正是第一轮删掉的东西：更近的物理包会盖住宿主
那一份。垫片只在裸 node 测试进程里生效，不污染 DSH 运行期。

```bash
DSH_INSTALL_ROOT=/path/to/dsh-install/node_modules \
  node --import ./scripts/dsh-resolve.mjs scripts/test-prefs.mjs .
```

#### `README.md`

三处陈旧说明改掉：

1. **「包必须放在 profile 树内」——这条现在是错的。** 实测（见上）插件放在
   `<DSH_HOME>/plugins/amap-trip/plugin`、只靠 profile 的 `node_modules` 软链挂包名，
   0.2.1 下照常加载，schemastery 落到宿主安装根。README 里换成了实测结论 +
   「不要用本地 `node_modules` 解决这个导入」的警告。
2. 「开发」一节补 `scripts/dsh-resolve.mjs` 的用法。
3. 「部署脚本」脚注里"裸 node 会报 `ERR_MODULE_NOT_FOUND`，属预期"改为指向上面的垫片。

## 七、未改动

`index.mjs` / `core.mjs` / `corridor.mjs` / `prefs.mjs` / `map-html.mjs` /
`presets/*.json` / `cordis.patch.yml` / `cordis.yml` 本轮**逐字节未改**。
10 个工具、`Config` schema、产物落盘逻辑、Skill 全部原样。

## 八、逐项核对过、确认无需改动的契约

| 用到的能力 | 0.2.0-rc.2 → 0.2.1-alpha.1 |
| --- | --- |
| `export const inject = ['tools']` | 服务名与语义未变 |
| `ctx.tools.register({name, description, parameters, output:{schema,render}, execute})` | `ToolDefinition` 未变；`dsh-tools` 本轮的类型差异只有三处：删掉 `invariant.d.ts`、`run_code` 的**参数顺序**由 `code, description` 改成 `description, code`（纯文案/顺序，与本插件无关）、若干注释 |
| `parameters` 的 JSON Schema 子集 | `assertSupportedJsonSchema` 未变 |
| `output.render(args, value) → ContentBlock[]` | 未变 |
| `execute(args, exec)` 的 `exec.signal` 取消透传 | `ToolRunContext` 未变 |
| `export const Config = Schema.object({...})`（Schemastery） | cordis `4.0.4 → 4.0.5-alpha.1`，其 `lib/types` **逐字节相同**；schemastery 3.18.4 → 3.18.5-alpha.1 是补丁级预发布，`Config` 解析未变（本包 `Config` 不依赖任何 dsh 包） |

### 明确**不适用**的破坏性变更

| 0.2.1 的破坏性变更 | 本插件为何不受影响 |
| --- | --- |
| 运行时 invariant 整体移除 | 零命中 |
| `agent.inject` / `followup` 的 `source.kind` | 本插件不注入会话消息 |
| 子路径插件不再读 `<子路径>/package.json` | 挂载行是**包根**（`name: 'amap-trip'`） |
| Automation tasks bundle 退休 | 不依赖该 bundle |
| `@deepseek-ai/dsh-llm-deepseek` 拆包 | 不引用 LLM 适配器 |
| `WorkspaceController.initializeDefault` 签名变化 | 未使用 |
| Auto 审批预设固定为 `danger-full-access` + `ask` | 未注册审批策略 |
| `ctx.typert` / `ctx.typertGateway` 的 `hasLiveClient()` | 未使用 |

## 九、验证方式（全部在 DSH 0.2.1-alpha.1 上跑）

测试环境全部建在会话工作区内，**没有改动本机 `~/.dsh`**：
`testenv/` = `npm i @deepseek-ai/dsh@0.2.1-alpha.1`；`testhome/` = 隔离的 `DSH_HOME`
（`profiles/web/node_modules/amap-trip` 软链到工作区里的 `plugins/amap-trip/plugin`）。

1. **兼容性预检**：用 0.2.1 自己的 `@deepseek-ai/dsh-app-boot` 导出的
   `evaluatePluginCompatibility()` 检查本包 manifest → **COMPATIBLE**。
   （该函数只比对 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*`，`@deepseek-ai/schemastery`
   不在它的检查范围内——所以 schemastery 的范围问题不会被预检拦下，只能自己核对。）
2. **解析路由对照实验**：见第六节，两个探针插件的实测输出。
3. **真实进程**：`dsh --profile web --no-open` 正常起服务，无模块未找到、
   无 `patch: entry ... not found`、无"required plugin did not activate"。
4. **本包测试套件**（全部在 0.2.1 的 `node_modules` 下、经 `dsh-resolve.mjs` 跑）：
   - `test-categories.mjs` → **全部通过**（150500/150700/150100 归 transit、
     141200/080111 归 crowd、复合类型码取首个命中、daily 顺序取自声明）；
   - `test-prefs.mjs` → 通过（两套偏好互不可见、模式自动切换、ops 默认 `crowd+emergency`）；
   - `verify-fixes.mjs` → 通过（走廊 5 点/61 点位、终点天气、CSV 带
     `tel/rating/cost` 列、缓存命中 97ms → 0ms）；
   - `check-outdir.mjs` → 通过（产物目录按会话 cwd 推导，`amap_map` 出图成功）；
   - 以上都真的打了高德线上接口（本机有 key），不是桩。
5. **组合校验**：`dsh --profile web --dump-config` 里 `- id: amap-trip / name: amap-trip`
   行正常出现。

## 十、安装与回退

安装方式不变（第一轮第五节的两种均可）。注意 0.2.1 起**不再要求**把包放进 profile 树内，
但放进 profile 树内也照常工作。

回退：把 `plugin/package.json` 换回 `0.1.7` 的版本（`~3.18.4`）、删掉
`scripts/dsh-resolve.mjs`、`README.md` 换回备份即可。

