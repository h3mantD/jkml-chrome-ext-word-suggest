(() => {
  const SOURCE = "jkml-helper-bridge";

  if (window.__jkmlHelperBridgeInstalled) {
    return;
  }
  window.__jkmlHelperBridgeInstalled = true;

  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) {
    return;
  }

  function emitChunk(chunk, score) {
    window.postMessage(
      {
        source: SOURCE,
        type: "chunk",
        chunk,
        score
      },
      "*"
    );
  }

  function extractChunkFromText(text) {
    if (!text || text.length > 20000) {
      return null;
    }

    const keyPattern = /(?:syllable|chunk|prompt|letters|sequence|seq|part)["':\s=]+([a-z]{1,4})/gi;
    const keyed = [];
    let match;

    while ((match = keyPattern.exec(text))) {
      keyed.push(match[1].toLowerCase());
    }

    if (keyed.length > 0) {
      return { chunk: keyed[keyed.length - 1], score: 11 };
    }

    const quotedPattern = /"([a-z]{1,4})"/g;
    const tokens = [];
    while ((match = quotedPattern.exec(text))) {
      tokens.push(match[1].toLowerCase());
    }

    if (tokens.length === 0) {
      return null;
    }

    const recent = tokens.slice(-12);
    const counts = new Map();
    for (const token of recent) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    let bestToken = null;
    let bestScore = -1;
    for (const [token, count] of counts.entries()) {
      const score = count * 1.4 + (token.length === 2 || token.length === 3 ? 1.5 : 0.5);
      if (score > bestScore) {
        bestScore = score;
        bestToken = token;
      }
    }

    if (!bestToken) {
      return null;
    }

    return { chunk: bestToken, score: 8 + bestScore };
  }

  function asText(data) {
    if (typeof data === "string") {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      try {
        return new TextDecoder().decode(data);
      } catch (error) {
        return "";
      }
    }

    return "";
  }

  function handleMessage(data) {
    const text = asText(data);
    const result = extractChunkFromText(text);
    if (!result) {
      return;
    }

    emitChunk(result.chunk, result.score);
  }

  function WrappedWebSocket(url, protocols) {
    const socket = protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);

    socket.addEventListener("message", (event) => {
      handleMessage(event.data);
    });

    return socket;
  }

  WrappedWebSocket.prototype = NativeWebSocket.prototype;

  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    if (key in NativeWebSocket) {
      WrappedWebSocket[key] = NativeWebSocket[key];
    }
  }

  window.WebSocket = WrappedWebSocket;
})();
