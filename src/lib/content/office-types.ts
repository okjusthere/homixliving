import type { ContentInput, Generation } from "./types";

export type OfficeRequest = {
  templateId: string;
  input: ContentInput;
  languages: ("zh" | "en")[];
};
export type OfficeTask = {
  id: string;
  subjectAgentId: number;
  agentName: string;
  templateName?: { en: string; zh: string };
  createdBy: number;
  creatorName: string;
  request: OfficeRequest;
  generationId: string | null;
  submissionStartedAt: string | null;
  createdAt: string;
};
export type OfficeGeneration = Generation & {
  officeTaskId: string;
  reviewStatus: "pending" | "approved" | "delivered";
};
