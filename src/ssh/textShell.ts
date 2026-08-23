export interface TtdTurnHandler {
  submit(input: string): Promise<{ response: string }>;
}

export interface TextSink {
  write(text: string): void;
  end(): void;
}

export class TtdTextShell {
  private buffer = "";
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly decoder = new StringDecoder("utf8");

  constructor(
    private readonly handler: TtdTurnHandler,
    private readonly sink: TextSink,
    private readonly maxLineLength = 4096,
  ) {}

  start(): void {
    this.sink.write("secondary external reality MVP\r\n输入 exit 退出。\r\nttd: ");
  }

  receive(chunk: Buffer | string): void {
    if (this.closed) return;
    const text = (typeof chunk === "string" ? chunk : this.decoder.write(chunk)).replace(/\x7f|\x08/g, "\b");
    for (const character of text) {
      if (character === "\b") {
        if (this.buffer.length > 0) {
          this.buffer = this.buffer.slice(0, -1);
          this.sink.write("\b \b");
        }
      } else if (character === "\r" || character === "\n") {
        if (character === "\n" && this.buffer === "") continue;
        const line = this.buffer.trim();
        this.buffer = "";
        this.queue = this.queue.then(() => this.processLine(line));
      } else if (this.buffer.length < this.maxLineLength) {
        this.buffer += character;
        this.sink.write(character);
      }
    }
  }

  settled(): Promise<void> {
    return this.queue;
  }

  private async processLine(line: string): Promise<void> {
    if (this.closed) return;
    if (line === "exit" || line === "quit") {
      this.closed = true;
      this.sink.write("\r\n再见。\r\n");
      this.sink.end();
      return;
    }
    if (!line) {
      this.sink.write("\r\nttd: ");
      return;
    }
    if (line === "help" || line === "帮助" || line === "?") {
      this.sink.write("\r\n可尝试：look（环顾）、inventory（手中物品）、钥匙在哪里、抽屉里有什么、打开/关闭、拿起、放到表面或容器、写藏并读取纸条。可用‘然后’连接动作，输入 exit 退出。\r\nttd: ");
      return;
    }
    this.sink.write("\r\n");
    try {
      const result = await this.handler.submit(line);
      this.sink.write(`${result.response}\r\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/ is closed\.$/u.test(message)) this.sink.write("目标容器是关闭的，需要先打开。\r\n");
      else if (/not currently visible/u.test(message)) this.sink.write("你目前看不到这个对象。\r\n");
      else if (/ambiguous/u.test(message)) this.sink.write("对象指代不明确，请说得更具体。\r\n");
      else if (/[\u3400-\u9fff]/u.test(message)) this.sink.write(`${message}\r\n`);
      else this.sink.write("这个行动目前无法在最小世界中收束；输入 help 查看当前能力。\r\n");
    }
    this.sink.write("ttd: ");
  }
}
import { StringDecoder } from "node:string_decoder";
