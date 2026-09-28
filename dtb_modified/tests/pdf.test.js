import { describe, it, expect } from "vitest";
import { buildMinimalPdf, pdfEscape, DISCLAIMER } from "../src/lib/pdf.js";

function decode(bytes) {
  return new TextDecoder("latin1").decode(bytes);
}

/**
 * The xref table in a PDF is a set of byte offsets. The v1 fallback computed
 * them with String.length on a string containing non-ASCII characters, so every
 * offset after the first was wrong and the file would not open. These tests
 * verify the offsets point at the objects they claim to.
 */
function indexOfStreamStart(bytes) {
  const needle = [..."stream\n"].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return i + needle.length;
  }
  throw new Error("no content stream found");
}

function indexOfEndStream(bytes) {
  const needle = [..."\nendstream"].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  throw new Error("no endstream marker found");
}

function parseXrefOffsets(text) {
  const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split(/\s/)[0]);
  const xref = text.slice(startxref);
  const header = xref.match(/xref\s+0\s+(\d+)/);
  expect(header, "xref subsection header").toBeTruthy();
  const count = Number(header[1]);
  const entries = [...xref.matchAll(/^(\d{10}) 00000 n\s$/gm)].map((m) => Number(m[1]));
  expect(entries.length).toBe(count - 1);
  return entries;
}

describe("pdfEscape", () => {
  it("escapes the delimiters of a PDF literal string", () => {
    expect(pdfEscape("a(b)c\\d")).toBe("a\\(b\\)c\\\\d");
  });

  it("collapses newlines so a value cannot inject a new content operator", () => {
    expect(pdfEscape("line1\nline2\r\nline3")).toBe("line1 line2 line3");
  });

  it("treats null and undefined as empty", () => {
    expect(pdfEscape(null)).toBe("");
    expect(pdfEscape(undefined)).toBe("");
  });
});

describe("buildMinimalPdf", () => {
  it("emits a PDF header, a startxref and a trailer", () => {
    const text = decode(buildMinimalPdf(["hello"]));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("startxref");
    expect(text).toContain("/Type /Catalog");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("writes offsets that point at the real object headers", () => {
    // The failure mode this guards against: valid-looking table, unusable file.
    const text = decode(buildMinimalPdf(["alpha", "beta", "gamma"]));
    const offsets = parseXrefOffsets(text);
    expect(offsets.length).toBe(5);
    offsets.forEach((offset, i) => {
      expect(text.startsWith(`${i + 1} 0 obj`, offset)).toBe(true);
    });
  });

  it("keeps the xref valid when a line contains multi-byte characters", () => {
    // The em dash and degree sign are multi-byte in UTF-8 but single WinAnsi
    // bytes. Measuring the stream in characters rather than written bytes is
    // what broke the v1 table.
    const text = decode(buildMinimalPdf(["Résumé — 37°", "positive", "no match"]));
    const offsets = parseXrefOffsets(text);
    offsets.forEach((offset, i) => {
      expect(text.startsWith(`${i + 1} 0 obj`, offset)).toBe(true);
    });

    // The em dash is written as its single WinAnsi byte 0x97 rather than three
    // UTF-8 bytes, which is what keeps the offsets above correct. Assert on the
    // raw bytes: the "latin1" decoder label is actually windows-1252 and would
    // map 0x97 back to U+2014.
    const bytes = buildMinimalPdf(["Résumé — 37°", "positive", "no match"]);
    const start = indexOfStreamStart(bytes);
    const body = [...bytes.slice(start, indexOfEndStream(bytes))];
    expect(body).toContain(0x97); // WinAnsi em dash
    expect(body).not.toContain(0xe2); // no UTF-8 lead byte anywhere
    expect(body).not.toContain(0x80);
  });

  it("declares a stream length that matches the bytes actually written", () => {
    const text = decode(buildMinimalPdf(["Résumé — 37°"]));
    const declared = Number(text.match(/\/Length (\d+) >>/)[1]);
    const stream = text.slice(text.indexOf("stream\n") + 7, text.indexOf("\nendstream"));
    // The bytes are the ones emitted, not a UTF-8 re-encoding of the source:
    // the em dash and degree sign are single WinAnsi bytes here.
    expect(declared).toBe(stream.length);
  });

  it("escapes parentheses in a rendered value", () => {
    const text = decode(buildMinimalPdf(["value (with parens)"]));
    expect(text).toContain("(value \\(with parens\\)) Tj");
  });

  it("truncates overflow and says how much was dropped", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const text = decode(buildMinimalPdf(lines, 10));
    // The count is rendered through pdfEscape, so the parentheses are escaped.
    expect(text).toContain("further line\\(s\\) omitted");
    expect(text).toContain("line 8");
    expect(text).not.toContain("line 50");
  });

  it("survives an empty or non-array input", () => {
    for (const input of [[], null, undefined, "nope"]) {
      const text = decode(buildMinimalPdf(input));
      expect(text).toContain("/Type /Page");
      expect(parseXrefOffsets(text).length).toBe(5);
    }
  });
});

describe("disclaimer wording", () => {
  it("states the record is an operator observation and needs laboratory confirmation", () => {
    expect(DISCLAIMER).toMatch(/operator/i);
    expect(DISCLAIMER).toMatch(/does not identify controlled substances/i);
    expect(DISCLAIMER).toMatch(/laboratory/i);
  });

  it("denies forensic standing rather than asserting it", () => {
    const text = DISCLAIMER.toLowerCase();
    // "forensic" appears only inside a denial, so check the surrounding words.
    expect(text).toContain("is not a validated forensic instrument");
    for (const claim of [
      "certified result",
      "confirmed positive",
      "laboratory confirmed",
      "chain of custody",
      "tamper-proof",
      "tamper evident",
      "digitally signed"
    ]) {
      expect(text).not.toContain(claim);
    }
  });

  it("does not present the observation as a laboratory result", () => {
    expect(DISCLAIMER).toMatch(/presumptive/i);
    expect(DISCLAIMER).toMatch(/requires confirmatory/i);
  });
});
