# Homix 海报风格更新

房源每个主题只提供 Homix 经典、Homix 极简，默认经典。节日只提供简约祝福、节庆插画，默认简约。切换房源主题保留已选风格；复用已退役模板的作品时回到当前默认模板。

## 设计规则

- 经典：奶油白、炭黑、少量哑光香槟金，编辑式标题、大房源照片、自然抠像署名。
- 极简：暖白、深灰、清晰网格和字体层级，减少边框、装饰和图标。
- 允许头像跨照片边界、标题利用干净留白；不遮挡建筑关键部位、脸、日期、价格或其他文字。
- 不再要求每段文字放在独立实色面板，也不用大面积灰色蒙层压暗房源。
- 已签约、成交等简短主题突出大照片；公展优先完整场次；信息多时扩展信息区，保留已选卖点，不缩成小字。
- 保留原始照片、头像、Logo、公司页脚、单语版本、税费卖点、无执照号以及公展月份缩写规则。

## 验证与发布

1. `npm run test:content`、`npx tsc --noEmit`、相关文件 ESLint、生产构建。
2. 对同一条已完成的公展素材生成四张本地样张：两种风格各一张英文已签约、中文双场公展。旧日期作为对比测试资料，不用于新的活动宣传。
3. 检查房屋与头像一致、Logo 可读、字体和对比度、公展两场完整、无年份时区、公司页脚与整体融合。样张不自动公开发布。
4. 代码发布成功后，运行模板更新脚本。默认 dry-run；显式 `--apply` 才发布。脚本以事务发布 14 个新模板版本并退役旧房源/节日版本；不删除历史模板、不修改历史生成结果，不影响生日与周年模板。
5. 再次 dry-run 应显示 14 个 unchanged，publish/retire 均为空。线上每个房源主题与节日应仅显示两种风格，默认顺序稳定。

```sh
node --env-file=.env.production.local --env-file=.env.content-production.local --import tsx scripts/verify-content-styles.ts GENERATION_ID /private/tmp/homix-style-review
node --env-file=.env.production.local --import tsx scripts/publish-content-brand-refresh.ts
node --env-file=.env.production.local --import tsx scripts/publish-content-brand-refresh.ts --apply
```

环境文件保持本地私有，不提交凭据或生产素材。确认生产模板清单后再执行发布。历史版本保存在同一 family 中，可通过现有管理员发布功能回退；其他被退役的风格也可重新发布。
