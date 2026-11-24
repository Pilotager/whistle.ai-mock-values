# Whistle AI Mock Values

在 Whistle Desktop 的 Values 中右键分组，输入需求或粘贴一个接口定义，点「创建」。插件按分组和接口名生成 JSON 条目，保存后自动选中。示例文件名为 `sell_business_tool.getClueDetail.json`。若已存在同名条目，新条目使用 `-2`、`-3` 等后缀。

## 安装与模型配置

需要 Node.js 18 或更高版本。在项目目录运行：

```sh
npm ci
npm run link:desktop
```

第二条命令把项目目录链接到本机 Whistle Desktop 的插件目录，可重复执行。在 Plugins 中打开 **ai-mock-values → Option**，填写兼容 Chat Completions 的模型服务地址、模型 ID 和所需的 API Key。地址填到 API 基础路径，例如 `https://api.openai.com/v1`。插件会追加 `/chat/completions`。本机免鉴权模型服务支持 HTTP 和空密钥。

配置文件为 `~/.config/whistle.ai-mock-values/model.json`，以仅当前用户可读写的权限保存。模型收到你在弹窗输入的内容。使用环境变量时，可在启动 Whistle 前设置 `AI_MOCK_BASE_URL`、`AI_MOCK_MODEL` 和 `AI_MOCK_API_KEY`。已保存的设置优先。

## 创建

在 Values 左侧右键目标分组标题，选择 **Others → AI 创建 Mock**。不同版本的菜单可能显示在 **Plugins** 下。

- 需求输入。例如「给 getClueDetail 生成一条已领取的线索，包含领取人和领取时间」。直接创建 Value。
- 接口输入。例如下面的两行。插件创建 Value，并自动加载对应的 Whistle 规则。

```text
POST https://api.example.test/clue/detail
接口名 getClueDetail，返回 code、message 和 data，data 包含线索编号和领取人。
```

支持单接口的 OpenAPI JSON/YAML、含 `method` 与 `url` 或 `path` 的对象，以及显式的 `METHOD URL`。规则使用输入中可确定的单一请求目标；提供方法时会一同匹配。空缺路由、路径模板、多个操作或标明共享网关时仅生成 Value。仅写相对路径（例如 `GET /clues`）时，会匹配任意 HTTP(S) 主机上的该路径。需要限定环境时请填写完整 URL。共享网关通过请求体区分操作时，请仅输入业务需求生成 Value，自行配置请求体过滤条件。

提供单一明确的请求目标时，插件直接把 `file://{Value 名}` 写进 **Rules → 与 Values 分组同名的文件**。可以写 `GET /api/clues` 或粘贴完整请求 URL；只给 URL 时匹配所有方法。只有业务需求时，只创建 Value。

再次生成同一目标时，只更新插件标记的匹配行，保留手写规则。单选模式下若已经启用其他项目，插件保存规则并提示当前文件未启用。原生规则可在 Rules 中编辑、注释或删除。0.1 版已有的动态规则继续可用，再次通过「AI 创建 Mock」生成同一接口后切换为原生规则。

## 测试

```sh
npm test
```

该版本使用 Whistle Desktop 1.6.16 所附内核 2.10.15 做过独立实例验证。
