export const ide =
  globalThis.requestIdleCallback ||
  (globalThis.requestAnimationFrame
    ? (fn: Function) =>
        globalThis.requestAnimationFrame(() => {
          setTimeout(() => {
            fn();
          });
        })
    : globalThis.setTimeout);

export const now = () => {
  const timer = globalThis.performance || globalThis.Date;
  return timer.now();
};
let channel: MessageChannel = globalThis.MessageChannel ? new MessageChannel() : null;
if (globalThis.MessageChannel) {
  channel = new MessageChannel();
}
let msgId = 0;
export const macro = fn => {
  if (!channel) {
    setTimeout(fn);
  }
  const memoId = msgId;
  function onMessage(e) {
    if (memoId === e.data) {
      fn();
      channel.port2.removeEventListener('message', onMessage);
    }
  }
  channel.port2.addEventListener('message', onMessage);
  channel.port1.postMessage(msgId++);
};

const p = Promise.resolve();
export const micro = (cb: () => any) => {
  p.then(cb)
}