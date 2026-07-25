BEGIN;

UPDATE portal.training_videos
SET
  category = '内容营销与个人品牌',
  updated_at = NOW()::text
WHERE category IN (
  '自媒体培训',
  'IP 培训 / 个人品牌',
  'IP培训/个人品牌'
);

UPDATE portal.training_videos
SET
  category = '行业趋势与活动',
  updated_at = NOW()::text
WHERE category = 'Inman 2026';

COMMIT;
