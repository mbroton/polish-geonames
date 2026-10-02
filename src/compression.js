// Some static servers mark .gz files as Content-Encoding: gzip; the browser then
// decodes them before JavaScript receives the body. Inspect the bytes, not the URL.
export async function decodedBody(response) {
  if (!response.ok || !response.body)
    throw new Error("The data file could not be loaded. Please try again.");
  const reader = response.body.getReader();
  let head = new Uint8Array();
  while (head.length < 2) {
    const { value, done } = await reader.read();
    if (done) throw new Error("The data file is empty or incomplete.");
    const next = new Uint8Array(head.length + value.length);
    next.set(head);
    next.set(value, head.length);
    head = next;
  }
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return head[0] === 0x1f && head[1] === 0x8b
    ? stream.pipeThrough(new DecompressionStream("gzip"))
    : stream;
}
