export function createZoteroAbortController(): AbortController {
  const { mainWindow, hiddenWindow } = domWindows();
  const zoteroRuntime = zoteroGlobal();
  const runtime = globalThis as typeof globalThis & {
    AbortController?: typeof AbortController;
  };
  const Constructor =
    mainWindow?.AbortController ||
    hiddenWindow?.AbortController ||
    zoteroRuntime?.AbortController ||
    runtime.AbortController;
  if (typeof Constructor !== "function") {
    throw new Error("Zotero DOM window does not provide AbortController");
  }
  return new Constructor();
}

function domWindows(): {
  mainWindow?: Window & {
    AbortController?: typeof AbortController;
    TextDecoder?: typeof TextDecoder;
    fetch?: typeof fetch;
  };
  hiddenWindow?: Window & {
    AbortController?: typeof AbortController;
    TextDecoder?: typeof TextDecoder;
    fetch?: typeof fetch;
  };
} {
  return {
    mainWindow: Zotero.getMainWindow() as any,
    hiddenWindow: (Services as any).appShell?.hiddenDOMWindow as any,
  };
}

export function zoteroFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const { mainWindow, hiddenWindow } = domWindows();
  const zoteroRuntime = zoteroGlobal();
  const runtime = globalThis as typeof globalThis & { fetch?: typeof fetch };
  const owner = mainWindow?.fetch
    ? mainWindow
    : hiddenWindow?.fetch
      ? hiddenWindow
      : zoteroRuntime?.fetch
        ? zoteroRuntime
        : runtime;
  if (typeof owner?.fetch !== "function") {
    throw new Error("Zotero DOM window does not provide fetch");
  }
  return owner.fetch.call(owner, input, init);
}

export function createZoteroTextDecoder(): TextDecoder {
  const { mainWindow, hiddenWindow } = domWindows();
  const zoteroRuntime = zoteroGlobal();
  const runtime = globalThis as typeof globalThis & {
    TextDecoder?: typeof TextDecoder;
  };
  const Constructor =
    mainWindow?.TextDecoder ||
    hiddenWindow?.TextDecoder ||
    zoteroRuntime?.TextDecoder ||
    runtime.TextDecoder;
  if (typeof Constructor !== "function") {
    throw new Error("Zotero DOM window does not provide TextDecoder");
  }
  return new Constructor("utf-8");
}

export function decodeUTF8(value: AllowSharedBufferSource): string {
  return createZoteroTextDecoder().decode(value);
}

function zoteroGlobal():
  | {
      AbortController?: typeof AbortController;
      TextDecoder?: typeof TextDecoder;
      fetch?: typeof fetch;
    }
  | undefined {
  try {
    return (Components as any).utils.getGlobalForObject(Zotero) as any;
  } catch {
    return undefined;
  }
}

export function createAbortError(message = "Cancelled"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
