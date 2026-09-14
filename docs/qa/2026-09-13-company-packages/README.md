# 公司标准文件包：第一阶段验收

日期：2026-09-13（America/New_York）。结论：本地机制完成，正式 PDF 配置与生产发布待后续执行。

Portal 基线 `8d053d9`，eSign 基线 `db66095`，两边实施分支均为 `codex/company-standard-packages`。原生引擎为与生产一致的 Documenso 2.18.0。没有将本地测试部署到生产。

## 范围

公司管理员上传一组 PDF，进入公司模板配置角色、字段及版本；普通经纪人在 Portal 选择已发布包，填一位/两位客户姓名邮箱、房产及业务资料，查看原 PDF 与预填，确认后发送。各签署人使用自己的入口完成整包，Portal 跟进并收回完成 PDF/ZIP。

公司持有原生文档，Portal `ownerAgentId` 负责经纪人任务隔离。经纪人和客户不需要 Documenso 原生账号。个人上传、custom 新建、经纪人原生编辑入口与新建个人连接关闭，保留旧任务按原连接读取。

## 已执行结果

| 检查 | 结果与证据范围 |
|---|---|
| Bridge 契约 | 14 项通过；增加相同/缺失顺序号拒绝、并行允许、预览不暴露 token/storage ID、中文下载文件名安全回归 |
| 公司原生流程 | 实际公司模板上传、字段配置、发布，agent + 1 client / agent + 2 clients 均在真实本地原生引擎签完两份 PDF；测试经纪人没有个人 native connection |
| 准备/发送边界 | 创建与审阅保留 draft；真实 PDF 与安全字段投影，发送需一致的 reviewHash；幂等键复用，模板/草稿变化和停用版本被拦截 |
| Portal 实际 HTTP | 真实路由 → Bridge HTTP → Documenso/本地私有 S3；管理员上传、重试、包目录、准备、PDF 与 ZIP 均通过 |
| 权限 | 伪造 owner 被当前经纪人替换；错误公司被拒；同公司另一经纪人的详情、预览、下载、ZIP、恢复与操作拒绝；停用身份和过期管理员声明被拒；个人/editor 请求 403 |
| 完成件 | 两份原生完成 PDF + 完成证明 + 审计 + SHA-256 manifest；ZIP 中 PDF 字节与原生下载逐一相同。客户端无 cookie 的签署 token 下载也逐字节一致 |
| 恢复 | 实际拒签（等待异步事件）、撤销/丢弃、完成后重新准备；前次关联及原因保留，旧签名不复制；unknown 状态禁止重复发送/新建替代任务直至核对或明确关闭 |
| 过期 | 合成 recipient 过期后显示需处理；提醒续期；重复即时提醒受限 |
| 分页与退避 | 615 条、21 页、同时间戳稳定排序、五类各 123 条；搜索/跨经纪人/越界页计数通过。101 条失败 webhook 后的健康事件仍被处理，失败进入下次重试时间 |
| 入职回归 | 实际 HR 模板 → Bridge HTTP → Portal 准备、顺序角色、持久回调重试、未付款不提前激活通过；推荐、邀请策略、团队申请、入职路由及签署投影单测通过 |
| 最终静态检查 | Portal `tsc --noEmit`、所有变更 TS/TSX 的 ESLint、生产 `npm run build` 通过；eSign lint/typecheck/14 tests/build 通过；两边 diff whitespace 检查通过 |

## 实际浏览器验收

通过 CUA 操作本地 Portal 与 Documenso，使用虚构收件人及标注 `SYNTHETIC QA / NOT A CONTRACT` 的 PDF。所有邮件进入本地 Mailpit，没有给真实客户发邮件。

1. 经纪人进入卖家双客户包，代理人信息自动填入，再填两位客户姓名邮箱和房产信息。
2. Portal 展示两份真实 PDF、预填值和未签字段；第二份未查看时确认控件仍不可用，全部查看后确认发送。
3. 在先行签署人完成前，最后一位客户显示等待轮次。
4. 合成经纪人及第一位客户通过原生公开签署 API 完成其字段；最后一位客户在 **390×844 浏览器视口**亲自完成两份文件的签名交互、Finish 与最终确认。
5. 完成页显示所有人已签，下载清单显示两份已签文件，点击下载可用；未跳转 Portal 登录，也未创建客户账号。
6. Portal 刷新后显示任务及三位签署人完成，可取得逐份 PDF、证明/审计及完整 ZIP，也可按此包重新准备。

浏览器任务 ID：`9003ff11-d739-4382-ab84-6c0b2d4951f2`；part：`8b3a773b-7b9f-4669-bdd7-25fd11b01bb5`。仅用于本地排查，不是生产业务记录。程序化完整案例的非敏感 ID 见 [evidence.json](evidence.json)。

本地原生 fixture 开启公开注册，完成页有可选“领取账号”区域，签署不依赖它；生产 Bicep 已关闭公开注册。没有将本地界面差异描述成已验证的生产显示效果。

## 重跑

本次 integration suites 依赖已有的隔离 native 测试栈，不是无服务的单元测试。固定测试端口及数据库是刻意限制，不能改成生产地址运行：PostgreSQL 5569、Documenso 3469、Mailpit 8469、S3 模拟存储 4569。私有 fixture 路径 `/private/tmp/homix-documenso-integration/fixtures.json` 含仅本地公司 token，不提交仓库；公司 Bridge DB 只有测试公司连接，10401/10402 无原生个人连接。Portal DB 使用合成 onboarding schema/agents。创建该测试栈的历史本地脚本不属于可移植的一键 CI fixture；在其他机器运行前需重建上述依赖。

按顺序运行公司原生流程（生成供 Portal 用的完成案例）、状态测试、Portal 路由测试：

```sh
# eSign worktree
node --import tsx apps/bridge/src/__tests__/company-packages.integration.ts
node --import tsx apps/bridge/src/__tests__/company-state.integration.ts

# Portal；ESIGN_REPO_PATH 指向包含本次分支的实际 checkout
DATABASE_URL=postgres://homix:synthetic-only@127.0.0.1:5569/homix_onboarding_integration \
ESIGN_REPO_PATH=/private/tmp/esign-company-standard-packages \
node --import ./scripts/test-server-only.mjs --import ./scripts/test-agreement-auth.mjs \
  --import tsx src/lib/__tests__/company-signing-http.integration.ts
```

本次 HR 原生回归沿用 `signing-native-http.integration.ts`，临时副本仅改用空闲 3130/4104 端口及公司测试 Bridge DB，避免与上一轮本地服务冲突；测试副本已删除。没有改变产品的入职/台费规则，也没有真实扣款。

## 正式包到位后的验收与发布

- 公司提供最终 PDF、所属公司、适用场景、签署人/顺序及字段规则。我逐页配置 signature/initial/date/text/checkbox、预填和一人/两人变体，再由公司确认。
- 每个客户包使用一个含多 PDF 的原生模板。只支持不同序号的严格顺序或全部并行，不使用“同序号并行组”。
- 检查正式内容的长文本、必填、No/Unknown/NA、每页字段位置及所有参与人的可见范围。用实际模板重新走手机/桌面到完成件。
- 先发布兼容 Bridge 与其 additive migration，再发布 Portal，确认私有存储和 `/signing-pdf/` 静态资源。正式模板发布及受控试点另行执行。
- 本轮未验证真实客户邮箱投递、生产新包及真实台费。正式 PDF 缺席、生产未部署，均不计作已完成的合同上线。

当前计划：[两阶段 Plan](../../plans/2026-09-13-client-signing-readiness.md)。
