export function createZoteroAbortController(): AbortController {
  const { mainWindow, hiddenWindow } = domWindows();
  const Constructor =
    mainWindow?.AbortController || hiddenWindow?.AbortController;
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
  const owner = mainWindow?.fetch ? mainWindow : hiddenWindow;
  if (typeof owner?.fetch !== "function") {
    throw new Error("Zotero DOM window does not provide fetch");
  }
  return owner.fetch.call(owner, input, init);
}

export function createZoteroTextDecoder(): TextDecoder {
  const { mainWindow, hiddenWindow } = domWindows();
  const Constructor = mainWindow?.TextDecoder || hiddenWindow?.TextDecoder;
  if (typeof Constructor !== "function") {
    throw new Error("Zotero DOM window does not provide TextDecoder");
  }
  return new Constructor("utf-8");
}

export function decodeUTF8(value: AllowSharedBufferSource): string {
  return createZoteroTextDecoder().decode(value);
}

export function createAbortError(message = "Cancelled"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
