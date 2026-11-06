/**
 * Turns every received CR into CR LF, for devices that end lines with CR alone
 * (Tera Term's "Receive: CR+LF"). An LF straight after a CR is already the
 * line feed and is dropped, including when the pair is split across chunks.
 */
export class CrNewline {
  private afterCr = false;

  push(chunk: Uint8Array): Uint8Array {
    const out = new Uint8Array(chunk.length * 2);
    let n = 0;
    for (const b of chunk) {
      if (b === 0x0a && this.afterCr) { this.afterCr = false; continue; }
      this.afterCr = b === 0x0d;
      out[n++] = b;
      if (this.afterCr) out[n++] = 0x0a;
    }
    return out.subarray(0, n);
  }

  reset(): void {
    this.afterCr = false;
  }
}
