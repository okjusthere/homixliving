import assert from "node:assert/strict";
import {
  isTrainingCategory,
  normalizeTrainingCategory,
  TRAINING_CATEGORIES,
  trainingCategoryDescription,
} from "../training-categories";

assert.deepEqual(TRAINING_CATEGORIES, [
  "租赁实务",
  "买家课程",
  "卖家课程",
  "内容营销与个人品牌",
  "地产实务与工具",
  "行业趋势与活动",
]);

assert.equal(normalizeTrainingCategory("自媒体培训"), "内容营销与个人品牌");
assert.equal(normalizeTrainingCategory("IP 培训 / 个人品牌"), "内容营销与个人品牌");
assert.equal(normalizeTrainingCategory("Inman 2026"), "行业趋势与活动");
assert.equal(normalizeTrainingCategory("未知分类"), null);
assert.equal(isTrainingCategory("租赁实务"), true);
assert.equal(isTrainingCategory("General"), false);
assert.ok(trainingCategoryDescription("地产实务与工具", "zh")?.includes("AI"));
assert.ok(trainingCategoryDescription("行业趋势与活动", "en")?.includes("conference"));

console.log("training category tests passed");
