import { BaseClient, BaseResponse } from 'geotiff';
class BufferedResponse extends BaseResponse {
  private code: number;
  private headers: Headers;
  private bytes: ArrayBuffer;
  constructor(code: number, headers: Headers, bytes: ArrayBuffer) {
    super();
    this.code = code;
    this.headers = headers;
    this.bytes = bytes;
  }
  get status() {
    return this.code;
  }
  getHeader(name: string) {
    return this.headers.get(name) ?? undefined;
  }
  async getData() {
    return this.bytes;
  }
}
// Retries are bounded; aborts cancel both reading and backoff. Never silently
// download a whole satellite image when a server ignores the Range header.
export class RangeClient extends BaseClient {
  async request(options: RequestInit = {}) {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      options.signal?.throwIfAborted();
      try {
        const signal = AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(25000),
        ]);
        const r = await fetch(this.url, { ...options, signal });
        if (r.status !== 206) {
          await r.body?.cancel();
          throw new Error(
            `COG 服务必须支持 Range 读取（收到 HTTP ${r.status}）`,
          );
        }
        const bytes = await r.arrayBuffer();
        return new BufferedResponse(r.status, r.headers, bytes);
      } catch (e) {
        last = e;
        options.signal?.throwIfAborted();
        if (attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, 400 * (attempt + 1)),
          );
      }
    }
    throw last;
  }
}
