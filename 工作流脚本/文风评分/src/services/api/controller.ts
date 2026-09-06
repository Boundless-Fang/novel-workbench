// 从 NextChat client/controller.ts 直接拷贝
// 存储消息流式控制器的池，用于停止/重试

export const ChatControllerPool = {
  controllers: {} as Record<string, AbortController>,

  addController(
    sessionId: string,
    messageId: string,
    controller: AbortController,
  ) {
    const key = this.key(sessionId, messageId);
    this.controllers[key] = controller;
    return key;
  },

  stop(sessionId: string, messageId: string) {
    const key = this.key(sessionId, messageId);
    this.controllers[key]?.abort();
  },

  stopAll() {
    Object.values(this.controllers).forEach((v) => v.abort());
  },

  stopSession(sessionId: string) {
    Object.keys(this.controllers).forEach((key) => {
      if (key.startsWith(sessionId + ",")) {
        this.controllers[key]?.abort();
        delete this.controllers[key];
      }
    });
  },

  hasPending() {
    return Object.values(this.controllers).length > 0;
  },

  remove(sessionId: string, messageId: string) {
    const key = this.key(sessionId, messageId);
    delete this.controllers[key];
  },

  key(sessionId: string, messageIndex: string) {
    return `${sessionId},${messageIndex}`;
  },
};
