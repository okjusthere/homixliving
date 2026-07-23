# Turso → Supabase Postgres 切换手册（pg-migration 分支）

代码已全部移植并在本地 Postgres 上通过 62 项 E2E + 全部单测。
main 分支仍是 Turso 版；**本分支合并/推送即触发切换部署**，因此下面的
顺序必须严格遵守。预计停写窗口 ~10 分钟（Stripe webhook 会自动重试，
不丢事件）。

## 需要的凭证（本地 .env.local，用后可删）

| 变量 | 来源 |
|---|---|
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Turso 控制台（导数据用） |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string（**Transaction pooler**，端口 6543） |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API（分桶脚本用，homix-website 侧） |

## 切换步骤

1. **建 schema**（本地跑，指向 Supabase）：
   ```bash
   DATABASE_URL=… npx tsx -e "import postgres from 'postgres'; import { ensureSchema } from './src/db/ensure-schema'; const s = postgres(process.env.DATABASE_URL!, {prepare:false}); ensureSchema(s).then(()=>s.end())"
   ```
2. **停写窗口开始**：Vercel dashboard 把 homixliving 项目 Pause（或挑深夜低峰）。
3. **导数据**：
   ```bash
   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… DATABASE_URL=… \
     npx tsx scripts/migrate-turso-to-pg.ts --truncate
   ```
   脚本自动做行数对账，任何不一致会以非零码退出。
4. **设生产环境变量**（值同上 DATABASE_URL）：
   ```bash
   vercel env add DATABASE_URL production
   ```
   另加（可选，身份写穿即时刷新官网缓存）：
   `HOMIXWEB_REVALIDATE_URL=https://www.homixny.com/api/revalidate-agents`
   `AGENTS_REVALIDATE_SECRET=<随机串>`（homix-website 侧也要配同一个）。
5. **合并 + 推送**：`git checkout main && git merge pg-migration && git push`
   —— Vercel 部署后 instrumentation 会再跑一次 ensure-schema（幂等）。
6. **恢复流量**（如有 Pause），验证：登录、/rental 列表、/finance、
   录一笔测试后删除。观察 Stripe webhook 面板有无重试成功记录。
7. **善后**：Turso 库导出一份备份后停用；`TURSO_*` 环境变量可删；
   本文件与 `scripts/migrate-turso-to-pg.ts` 保留一个版本周期后清理。

## 回滚

Vercel Instant Rollback 回到上一个 Turso 部署即可（数据在停写窗口内
未分叉）。若已恢复写入才发现问题，需要把窗口后的增量手工补回 Turso，
所以验证步骤不要省。

## 本地开发（切换后）

```bash
initdb -D ~/.homix-pgdata -U postgres --auth=trust   # 一次性
LC_ALL=C pg_ctl -D ~/.homix-pgdata -o "-p 5499" start
psql postgres://postgres@localhost:5499/postgres -c "create database homixliving"
npm run dev   # 无 DATABASE_URL 时自动连 localhost:5499
```
