# Homix Team Leader 招聘与 Onboarding 实施计划

## 1. 目标

将 Homix 的新人加入流程从“管理员逐人配置”改为“经纪人或 Team Leader 发起、系统自动归因和生成条款、管理员只做最终合规审核”。

完成后应支持：

- 所有在职 Agent 都能推荐新人并保留 Sponsor 归因。
- Team Leader 能独立招聘新人加入自己的团队。
- Sponsor 和 Team Leader 可以是同一个人，也可以是不同的人。
- 管理员可以处理公司直接招聘、线下招聘和例外情况。
- Team、Sponsor、佣金计划、Team Split、Cap 和期限在签约前清晰展示，签约后冻结。
- eSign、年费、线上或线下付款、推荐奖励和激活状态形成完整记录。
- `ONBOARDING_V2_ENFORCED` 只在生产 eSign、付款和合规烟测通过后设为 `1`。

## 2. 核心原则

### 2.1 Sponsor 与 Team 分离

- `Sponsor` 表示谁实际介绍新人加入 Homix，决定 Sponsor Reward。
- `Team` 表示新人加入后的经营组织，决定 Team Leader、Team Split、Cap 和 Team Agreement。
- Sponsor 不因为新人加入其他团队而改变。
- Team Leader 不因为管理该新人而自动成为 Sponsor，除非新人确实通过其招聘链接加入。

### 2.2 邀请信息必须显式

管理员界面不得继续通过“是否选择 Team”暗中推断邀请类型。创建邀请时必须明确选择：

1. 个人推荐
2. 团队招聘
3. 公司直接招聘

生成前显示 Team、Team Leader、Sponsor、计划、期限和锁定字段的确认摘要。

### 2.3 自动化不替代合规审核

系统负责资料收集、合同生成、付款和佣金归因。管理员最终只审核：

- 执照及所属公司是否正确
- 必需协议是否完成
- 年费是否已经结算
- Team Agreement 和佣金条款是否匹配
- 是否存在重复账户、错误 Sponsor 或其他例外

管理员不再重复录入新人已经填写并签署的信息。

## 3. 三种邀请类型

### 3.1 个人推荐链接 `personal_referral`

**入口：** `/profile` 的“我的推荐链接”

**创建者：** 所有 Active Agent

**规则：**

- `sponsor_agent_id` 固定为链接创建者。
- Sponsor 在接受邀请后锁定。
- 不强制新人加入创建者所在团队。
- 不直接锁定 Team、Plan 或 Term。
- 新人可以选择 Solo 计划；如申请加入团队，需要目标 Team Leader 接受。
- 链接支持通用链接和指定邮箱的一次性链接。

### 3.2 团队招聘链接 `team_recruiting`

**入口：** 新增 `/team-workspace` 的“邀请加入团队”

**创建者：** Team Leader、管理员

**规则：**

- 固定 `plan=team_member`。
- 固定目标 `team_id`。
- 固定适用期限及当前有效的 Team Compensation Config。
- Team Leader 直接创建时，Sponsor 默认是 Team Leader。
- Team Leader 可把 Sponsor 指定为自己团队内的其他 Active Agent，用于组员实际完成招聘的情况。
- Team Leader 不得选择其他团队成员或任意外部人员作为 Sponsor。
- 管理员可在有证据时指定任意有效 Sponsor。

### 3.3 公司直接邀请 `admin`

**入口：** 管理员后台的“Onboarding 邀请”

**创建者：** 仅管理员

**适用场景：**

- 公司办公室直接招聘
- 线下已经沟通完成的新经纪人
- 没有 Sponsor 的新人
- 需要指定非默认 Team 或 Sponsor 的例外情况
- 需要绑定指定邮箱的一次性邀请

**规则：**

- 管理员显式选择 Solo、Solo Pro、Team Member 或 Holding。
- Team Member 必须指定 Team。
- Sponsor 可为空。
- 管理员必须看到并确认所有锁定字段。

## 4. Team Leader 工作台

需要建立 Team Leader 工作台。当前邀请 API 已识别 Team Leader 权限，但 `/teams` 页面仍是管理员专属，导致 Team Leader 没有实际可用入口。

### 4.1 路由与可见性

- 新增路由：`/team-workspace`
- 仅 Team Leader 和管理员可以访问。
- Team Leader 只能读取和操作自己领导的团队。
- 管理员可以查看所有团队，但日常管理员团队管理仍保留在 `/teams`。
- 非 Team Leader 不显示导航入口，也不能通过直接访问调用相关 API。

### 4.2 第一版必须包含

#### 团队概览

- Team 名称
- Active、Pending、Inactive 成员数量
- 当前 Team Split、Team-sourced Split、Cap 和生效日期
- 即将生效的下一版本条款

#### 招聘邀请

- 生成团队通用招聘链接
- 生成指定邮箱的一次性邀请
- 选择 Sponsor，范围仅为本团队 Active Agent
- 查看链接创建时间、到期时间、使用次数和状态
- 复制、停用和重新生成链接

#### 招聘进度

按状态展示本团队候选人：

- 已打开邀请
- 资料待完成
- 协议待签署
- 年费待支付
- 等待管理员合规审核
- 已激活
- 被拒绝或已撤回

Team Leader 只能看到完成招聘所需的业务状态，不得看到 W-9、ACH、付款卡信息、管理员内部备注或完整法律证据文件。

#### 团队成员

- 当前成员及状态
- Sponsor
- 加入日期
- 当前适用 Team Compensation Config
- Onboarding 是否完成

### 4.3 Team Leader 条款权限

- Team Leader 可以创建未来生效的 Team Compensation Config 版本。
- 可修改 Team Split、Team-sourced Split 和 Cap，但必须处于公司配置的允许范围内。
- 已签署、已用于成交或已生效的版本不可原地修改。
- 修改后创建新版本和生效日期，并记录审计日志。
- 影响现有成员合同的重大调整需要重新接受条款或重新签署 Team Addendum。
- 管理员拥有最终审核、冻结和紧急撤销权限。

## 5. 完整新人流程

1. 新人打开邀请链接。
2. 系统验证 token、到期时间、使用次数和指定邮箱。
3. 新人通过 Google 登录或绑定已有 Pending 账户。
4. 系统绑定邀请，并分别保存 Sponsor 和 Team 路由。
5. 新人填写法定姓名、电话、执照、所属公司、业务方向等资料。
6. 系统显示佣金计划、公司 Split、Team Split、Cap、Sponsor Reward 规则、年费和期限。
7. Team 招聘链接或管理员锁定团队的邀请视为 Team Leader 已预先同意；个人推荐或自行注册申请团队时，先进入 `team_review`。
8. Team Leader 接受申请后，系统绑定 Team，并锁定接受当日有效的 Team Compensation Config；拒绝则返回计划选择，Sponsor 不变。
9. Team Member 明确接受已锁定的 Team Compensation Config。
10. Portal 调用生产 eSign，生成对应法律实体及计划的协议。
11. 新人完成电子签名及必要的公司 countersignature。
12. 新人在线支付年费，或管理员确认已经实际收到线下付款。
13. 系统生成统一订单、付款记录和 Sponsor Reward 记录。
14. 管理员完成执照与合规终审。
15. 账户变为 Active，立即进入 Portal。
16. 官网主页、Team、Sponsor 和佣金计划同步生效。

## 6. Sponsor 与 Team 冲突处理

### 6.1 个人推荐后申请加入团队

场景：Agent A 推荐新人 B，但 B 希望加入 Team Leader C 的团队。

处理方式：

- Sponsor 保留为 A。
- B 提交加入 Team C 的申请。
- C 接受后，系统为 B 绑定 Team C 当前有效条款。
- 不覆盖原 Sponsor。
- 协议展示 Sponsor A、Team C、Team Leader C。

### 6.2 Team Leader 邀请但实际介绍人是组员

场景：Team C 的 Agent A 实际招募新人 B，由 Team Leader C 发出团队邀请。

处理方式：

- 创建邀请时选择 Sponsor=A。
- Team 固定为 C。
- Team Leader 为 C。
- 推荐奖励发给 A，Team Split 按 Team C 条款计算。

### 6.3 多个邀请链接

- 一个账户只能有一个已接受的 Sponsor 归因。
- Sponsor 在 eSign 生成前如需更正，必须显示旧值、新值、修改人和原因。
- eSign 生成后不得直接修改 Sponsor、Team、Plan、Term 或 Compensation Config。
- 必须撤销未完成协议、重新生成邀请或协议，并保留审计记录。
- 不允许使用后打开的链接静默覆盖先前已经接受的 Sponsor。

## 7. 数据与 API 调整

### 7.1 保留现有邀请表

继续使用 `portal.onboarding_invitations`，保留：

- `kind`
- `team_id`
- `sponsor_agent_id`
- `plan`
- `affiliation_term_months`
- 四个 lock 字段
- `created_by_agent_id`
- 到期、使用次数和撤销状态

### 7.2 建议补充字段或事件

- 邀请显示名称或 campaign label
- `accepted_at`
- `accepted_by_agent_id`
- Team Leader 接受团队申请的时间与操作者
- Sponsor 或 Team 路由变更原因
- 招聘阶段事件或统一 onboarding event log

已落地：`team_join_requests` 保留申请及决定历史，`onboarding_events`
统一记录邀请创建/撤销、团队申请/替换/取消/接受/拒绝和资料完成事件。
通用 `audit_log` 继续记录 Team Leader 或管理员执行的业务操作。

不把敏感付款信息复制到邀请表。

### 7.3 权限规则

- 普通 Agent 只能创建 Sponsor 为自己的 `personal_referral`。
- Team Leader 只能创建指向自己团队的 `team_recruiting`。
- Team Leader 只能从自己团队 Active Agent 中选择 Sponsor。
- 管理员可创建所有类型并处理例外。
- 所有写操作必须在服务端重新验证角色与归属，不能依赖前端隐藏按钮。

## 8. 用户界面调整

### 8.1 `/profile`

保留“我的推荐链接”，文案明确：

> 记录你为介绍人，不会自动让新人加入你的团队。

### 8.2 `/team-workspace`

提供“邀请加入团队”，文案明确：

> 新人将加入当前团队并接受当前团队条款。介绍人默认为你，也可以选择实际完成招聘的本团队成员。

### 8.3 管理员 Onboarding 邀请

使用分段选择器显式选择邀请类型，不再通过 Team 字段推断。生成前显示确认摘要：

```text
邀请类型：加入指定团队
新人邮箱：agent@example.com
团队：Alpha Team
Team Leader：张三
Sponsor：李四
计划：Team Member
条款版本：v3，2026-09-01 生效
期限：12 个月
```

## 9. 审计与财务一致性

- Sponsor Reward 与 Team Split 是两条独立财务记录。
- Sponsor 同时是 Team Leader 时，两项都分别计算和展示，不合并为一笔来源不明的金额。
- 每笔成交记录使用成交时冻结的计划、Team Compensation Config 和 Sponsor。
- 年费支付产生独立的 Sponsor Plan Reward 时，也必须关联原邀请和 Sponsor。
- 线上 Stripe 与管理员确认的线下付款进入同一订单及 ledger 流程。
- 管理员修改 Sponsor、Team、付款或激活结果时必须产生审计事件。

## 10. 实施顺序

### Phase 1：邀请类型与权限收口

1. 管理员邀请表单增加显式邀请类型。
2. 增加 Team Leader 专属 API 响应范围和 Sponsor 候选限制。
3. 补齐 Sponsor 与 Team 独立归因测试。
4. 保持 `ONBOARDING_V2_ENFORCED=0`。

### Phase 2：Team Leader 工作台

1. 新增 `/team-workspace` 页面和导航入口。
2. 增加团队概览、邀请管理、候选人进度和成员列表。
3. 增加邀请撤销和指定邮箱邀请。
4. 验证 Team Leader 无法访问其他团队。

### Phase 3：冲突与条款版本

1. 支持个人 Sponsor 保留、目标 Team Leader 接受加入团队。
2. 支持 Team Leader 在自己团队内选择实际 Sponsor。
3. 完成 Team Compensation Config 版本化、范围限制和重新接受规则。
4. 补齐多链接、错误 Sponsor 和协议生成后变更的测试。

### Phase 4：生产 eSign 与付款闭环

1. 部署生产 eSign 环境和 HR credential。
2. 发布并固定各法律实体正式模板、版本和 schema hash。
3. 配置 Vercel Production 的全部 `ESIGN_*` 变量。
4. 完成在线支付和管理员确认线下付款烟测。
5. 验证 Sponsor Reward、Team Split、Cap 和 ledger。

### Phase 5：启用强制流程

1. 用内部测试 Agent 完成至少一条 Solo 流程。
2. 完成一条 Team Leader 同时为 Sponsor 的团队流程。
3. 完成一条 Sponsor 与 Team Leader 不同的团队流程。
4. 完成一条管理员招聘及线下付款流程。
5. 审核合同和财务证据。
6. 最后才将 `ONBOARDING_V2_ENFORCED=1`。

## 11. 验收清单

### 11.1 Team Leader 申请与启用

- [x] Solo Pro 可从 `/profile` 提交 Team Leader 申请。
- [x] 申请包含团队名称、预计成员、定位与拟定 Team Split。
- [x] 管理员批准时原子创建 `forming` Team 和 v1 Compensation Config。
- [x] Team Leader agreement 完成前，后端拒绝创建团队招聘链接。
- [x] 首名 Team Member agreement evidence 验证完成后，Team 与 Team Leader 自动启用。
- [ ] 法务提供并批准两家公司适用的正式 Team Leader agreement PDF。
- [ ] 生产 eSign 发布模板并在 Vercel 配置精确 template/version/schema pins。

- [ ] 普通 Agent 可生成个人推荐链接。
- [ ] 个人推荐链接只锁定 Sponsor，不强制 Team。
- [ ] Team Leader 可以访问自己的工作台。
- [ ] Team Leader 无法查看或操作其他团队。
- [ ] Team Leader 可以生成团队招聘链接。
- [ ] Team Leader 可以指定本团队 Active Agent 为 Sponsor。
- [ ] 管理员可以显式创建三种邀请。
- [ ] Sponsor 与 Team Leader 不同时能够正确保存和展示。
- [ ] 多链接不能静默覆盖已接受 Sponsor。
- [ ] Team 条款在 eSign 前展示，eSign 后冻结。
- [ ] Stripe 与线下付款进入相同财务流程。
- [ ] Sponsor Reward 与 Team Split 分开入账。
- [ ] 管理员只在所有强制条件完成后批准。
- [ ] 批准后用户无需退出登录即可进入 Portal。
- [ ] 生产 eSign 模板、凭证、版本和 schema hash 已固定。
- [ ] 所有生产烟测通过后才启用 `ONBOARDING_V2_ENFORCED=1`。

## 12. 非目标

第一版不包含：

- Team Leader 查看成员 W-9、ACH 或银行卡资料
- Team Leader 代替管理员完成执照合规批准
- Sponsor 多层级 Revenue Share
- Sponsor 在签约后自行转让
- Team Leader 任意修改已经签署或已用于成交的历史条款
- 自动批准执照或绕过必要的 broker review
