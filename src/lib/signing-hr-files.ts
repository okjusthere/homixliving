import type { SigningRequest } from "@/lib/signing-contract";

export function hrFileManifest(request: SigningRequest, baseUrl: string) {
  const url = (query: Record<string, string>) =>
    `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${new URLSearchParams(query)}`;
  return {
    documents: request.parts.flatMap(
      (part) =>
        part.document?.files.map((file) => ({
          id: `${part.id}:${file.id}`,
          name: file.title,
          originalUrl: url({
            document: `${part.id}:${file.id}`,
            kind: "original",
          }),
          signedUrl: part.document?.completionFilesReady
            ? url({ document: `${part.id}:${file.id}`, kind: "signed" })
            : null,
        })) || [],
    ),
    completionFiles: request.parts.flatMap((part) =>
      part.document?.completionFilesReady
        ? (["certificate", "audit-log"] as const).map((kind) => ({
            name: part.document!.title,
            kind,
            url: url({ part: part.id, kind }),
          }))
        : [],
    ),
  };
}
export type HrFileManifest = ReturnType<typeof hrFileManifest>;
