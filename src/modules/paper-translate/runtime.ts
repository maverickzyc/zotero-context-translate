/**
 * Zotero does not expose fetch/AbortController/TextDecoder uniformly across
 * platforms and plugin scopes, so they are resolved from whichever runtime
 * scope actually provides them.
 *
 * Two rules matter here:
 *
 * 1. Probing must never throw. `Services.appShell.hiddenDOMWindow` raises
 *    NS_ERROR_NOT_AVAILABLE on platforms that have no hidden window (headless
 *    Linux, for instance) instead of returning undefined, so every candidate
 *    is read behind a guard.
 * 2. All three APIs should come from the same scope when possible. An
 *    AbortSignal created in one realm is rejected by a fetch from another.
 */

const WEB_API_NAMES = ["AbortController", "TextDecoder", "fetch"] as const;

type WebApiName = (typeof WEB_API_NAMES)[number];

interface WebApiScope {
  AbortController?: typeof AbortController;
  TextDecoder?: typeof TextDecoder;
  fetch?: typeof fetch;
}

interface Candidate {
  label: string;
  scope?: WebApiScope;
}

export function createZoteroAbortController(): AbortController {
  const Constructor = resolveWebApi("AbortController");
  return new Constructor();
}

export function createZoteroTextDecoder(): TextDecoder {
  const Constructor = resolveWebApi("TextDecoder");
  return new Constructor("utf-8");
}

export function decodeUTF8(value: AllowSharedBufferSource): string {
  return createZoteroTextDecoder().decode(value);
}

export function zoteroFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const { scope, value } = resolveWebApiFrom("fetch");
  return value.call(scope, input, init);
}

export function createAbortError(message = "Cancelled"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function resolveWebApi<K extends WebApiName>(
  name: K,
): NonNullable<WebApiScope[K]> {
  return resolveWebApiFrom(name).value;
}

function resolveWebApiFrom<K extends WebApiName>(
  name: K,
): { scope: WebApiScope; value: NonNullable<WebApiScope[K]> } {
  const candidates = candidateScopes();
  // Prefer a scope that provides every web API so that an AbortSignal and the
  // fetch it is passed to always come from the same realm.
  const complete = candidates.find(
    (candidate) =>
      candidate.scope &&
      WEB_API_NAMES.every(
        (api) => typeof candidate.scope?.[api] === "function",
      ),
  );
  const chosen =
    complete ??
    candidates.find(
      (candidate) => typeof candidate.scope?.[name] === "function",
    );
  const value = chosen?.scope?.[name];
  if (typeof value !== "function") {
    throw new Error(
      `No Zotero runtime scope provides ${name}. Checked ${describeCandidates(candidates)}`,
    );
  }
  return {
    scope: chosen!.scope!,
    value: value as NonNullable<WebApiScope[K]>,
  };
}

function candidateScopes(): Candidate[] {
  return [
    candidate("main window", () => Zotero.getMainWindow()),
    candidate(
      "hidden DOM window",
      () => (Services as any)?.appShell?.hiddenDOMWindow,
    ),
    candidate("Zotero global", () =>
      (Components as any)?.utils?.getGlobalForObject(Zotero),
    ),
    candidate("plugin global", () => globalThis),
  ];
}

function candidate(label: string, read: () => unknown): Candidate {
  try {
    const scope = read();
    return { label, scope: (scope as WebApiScope) ?? undefined };
  } catch {
    // A candidate scope can be missing on this platform or unavailable at this
    // point in startup. Skip it rather than failing the whole lookup.
    return { label };
  }
}

function describeCandidates(candidates: Candidate[]): string {
  return candidates
    .map(({ label, scope }) => {
      if (!scope) {
        return `${label}=unavailable`;
      }
      const provided = WEB_API_NAMES.filter(
        (api) => typeof scope[api] === "function",
      );
      return `${label}=[${provided.join(",") || "none"}]`;
    })
    .join(" ");
}
