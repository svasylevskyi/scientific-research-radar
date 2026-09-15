import type { paths } from "./api.generated";

type SuccessfulJson<Operation> = Operation extends { responses: infer Responses }
  ? { [Status in keyof Responses]: Status extends 200 | 201 | 202
      ? Responses[Status] extends { content: { "application/json": infer Body } }
        ? Body : never
      : never }[keyof Responses]
  : never;

/** Resolve the response from an actual route, so changing its model is visible. */
export type ApiResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = SuccessfulJson<paths[Path][Method]>;
