import { describe, expect, it } from "vitest";
import { isLxchu, parseLxchu } from "./lxchu";
import { parsedDifferences } from "./lxchuCompare.testkit.ts";
import { ChartParseError, parseC2s } from "./parseChart";
const c2s = (...lines: string[]) => new TextEncoder().encode(lines.join("\r\n") + "\r\n");
const lxchu = (body: string[], keys: string[] = [], difficulty = 3) =>
  new TextEncoder().encode(
    ["&format=lxchu/1", "&id=1", ...keys, "", `&chart_${difficulty}=`, ...body, ""].join("\n"),
  );
function expectSameScore(source: Uint8Array, chart: Uint8Array, difficulty = 3) {
  for (const mirror of [false, true]) {
    const a = parseC2s(source, { difficulty, mirror });
    const b = parseLxchu(chart, { difficulty, mirror });
    expect(b.notes.length).toBe(a.notes.length);
    expect(parsedDifferences(a, b)).toEqual([]);
  }
}
function expectLineError(chart: Uint8Array, line: number | null, difficulty = 3) {
  let error: unknown;
  try {
    parseLxchu(chart, { difficulty, mirror: false });
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ChartParseError);
  expect((error as ChartParseError).line).toBe(line);
}
describe("parseLxchu", () => {
  it("reads timeline events and single notes as the c2s reader does", () => {
    expectSameScore(
      c2s(
        "BPM\t0\t0\t193.000",
        "BPM\t8\t192\t120.625",
        "MET\t0\t0\t4\t4",
        "MET\t4\t0\t4\t3",
        "SFL\t134\t0\t192\t1.500000",
        "SLP\t2\t0\t96\t0.5\t1",
        "SLP\t2\t192\t96\t0.25\t0",
        "DCM\t3\t0\t48\t2.000000",
        "CLK\t0\t0",
        "TAP\t6\t0\t4\t4",
        "CHR\t6\t192\t2\t4\tUP",
        "HLD\t7\t0\t0\t4\t192",
        "HXD\t7\t96\t4\t2\t96\tCE",
        "FLK\t7\t192\t6\t3\tL",
        "MNE\t7\t288\t9\t1",
        "SLA\t8\t0\t0\t16\t384\t2",
        "TAP\t8\t96\t-2\t4",
        "TAP\t8\t192\t15\t2",
      ),
      lxchu([
        "bpm 0 193",
        "beat 0 4/4",
        "speed:1 768..864 0.5",
        "speed 960..1056 0.25",
        "scroll 1152..1200 2",
        "beat 1536 3/4",
        "bpm 3264 120.625",
        "speed 51456..51648 1.5",
        "tap 2304 4-7",
        "tap 2496 2-5 ex up",
        "hold 2688..2880 0-3",
        "hold 2784..2880 4-5 ex center",
        "flick 2880 6-8",
        "mine 2976 9",
        "sla 3072..3456 0-15 2",
        "tap 3168 -2-1",
        "tap 3264 15-16",
      ]),
    );
  });
  it("reads whole slides and crushes as the c2s reader joins their segments", () => {
    expectSameScore(
      c2s(
        "BPM\t0\t0\t120.000",
        "SXD\t1\t0\t2\t4\t192\t8\t4\tSLD\tDW",
        "SLC\t1\t192\t8\t4\t192\t10\t4\tSLD",
        "SLD\t2\t0\t10\t4\t96\t12\t4\tSLD",
        "SLD\t3\t0\t0\t2\t384\t0\t2",
        "ALD\t4\t0\t3\t2\t0\t5.0\t384\t15\t2\t5.0\tBLK",
        "ALD\t5\t0\t15\t2\t0\t5.0\t192\t0\t1\t2.5\tBLK",
        "ALD\t6\t0\t0\t4\t48\t1.0\t96\t0\t4\t1.0",
      ),
      lxchu([
        "bpm 0 120",
        "slide 384 2-5 ex down -> 576 8-11 ~> 768 10-13 -> 864 12-15",
        "slide 1152 0-1 -> 1536 0-1",
        "crush 1536 3-4 h5 black -> 1920 15-16 h5 -> 2112 0 h2.5",
        "crush 2304 0-3 h1 every 48 -> 2400 0-3 h1",
      ]),
    );
  });
  it("applies AIR, AIR-HOLD and AIR-SLIDE lines to the object above them", () => {
    expectSameScore(
      c2s(
        "BPM\t0\t0\t120.000",
        "TAP\t1\t0\t0\t4",
        "AIR\t1\t0\t0\t4\tTAP\tDEF",
        "SLD\t1\t0\t4\t4\t384\t8\t4\tSLD",
        "TAP\t1\t192\t12\t4",
        "ADR\t1\t192\t12\t4\tCHR\tDEF",
        "AUL\t2\t0\t8\t4\tSLD\tPNK",
        "TAP\t3\t0\t0\t4",
        "AHD\t3\t0\t0\t4\tTAP\t96\tGRN",
        "AHX\t3\t96\t0\t4\tAHD\t96",
        "AHD\t3\t192\t0\t4\tAHX\t96",
        "HLD\t4\t0\t0\t4\t192",
        "ASD\t4\t192\t0\t4\tHLD\t5.0\t192\t4\t4\t10.5\tPNK",
        "ASC\t5\t0\t4\t4\tASD\t10.5\t96\t-2\t4\t0.0\tDEF",
        "ALD\t6\t0\t3\t2\t0\t5.0\t96\t3\t2\t5.0\tRED",
        "ADL\t6\t96\t3\t2\tALD\tGRN",
      ),
      lxchu([
        "bpm 0 120",
        "tap 384 0-3",
        "  air up",
        "slide 384 4-7 -> 768 8-11",
        "  air upleft pink",
        "tap 576 12-15",
        "tap 1152 0-3",
        "  airhold green -> 1248",
        "  airhold ~> 1344",
        "  airhold -> 1440",
        "hold 1536..1728 0-3",
        "  airslide h5 pink -> 1920 4-7 h10.5 ~> 2016 -2-1 h0",
        "crush 2304 3-4 h5 red -> 2400 3-4 h5",
        "  air downleft green",
      ]),
    );
  });
  it("carries the tutorial flag and the combo tempo into long-note ticks", () => {
    const notes = ["BPM\t0\t0\t120.000", "HLD\t1\t0\t0\t4\t384", "AHD\t2\t0\t0\t4\tHLD\t384"];
    const body = ["bpm 0 120", "hold 384..768 0-3", "  airhold -> 1152"];
    expectSameScore(
      c2s("TUTORIAL\t1", "PROGJUDGE_BPM\t1200.000", ...notes),
      lxchu(body, ["&tutorial_3=1", "&combo_bpm_3=1200"]),
    );
    expect(() => expectSameScore(c2s("PROGJUDGE_BPM\t1200.000", ...notes), lxchu(body))).toThrow();
  });
  it("reads only the requested difficulty", () => {
    const chart = new TextEncoder().encode(
      [
        "&format=lxchu/1",
        "&lv_0=1",
        "",
        "&chart_0=",
        "bpm 0 120",
        "tap 384 0-3",
        "",
        "&lv_3=13",
        "&chart_3=",
        "nonsense",
      ].join("\n"),
    );
    expect(parseLxchu(chart, { difficulty: 0, mirror: false }).notes.length).toBe(1);
    expectLineError(chart, 10, 3);
    expectLineError(chart, null, 2);
  });
  it("checks the format line", () => {
    expect(isLxchu(lxchu([]))).toBe(true);
    expect(isLxchu(c2s("BPM\t0\t0\t120.000"))).toBe(false);
    expectLineError(new TextEncoder().encode("&id=1\n&chart_3=\n"), 1);
    expectLineError(new TextEncoder().encode("&format=lxchu/2\n&chart_3=\n"), 1);
    const minor = new TextEncoder().encode("&format=lxchu/1.4\n&chart_3=\nbpm 0 120\n");
    expect(parseLxchu(minor, { difficulty: 3, mirror: false }).notes).toEqual([]);
  });
  it("ignores unknown keys, comments and extension lines", () => {
    const plain = lxchu(["bpm 0 120", "tap 384 0-3", "  air up"]);
    const extended = lxchu(
      [
        "# opening",
        "bpm 0 120",
        "",
        "x-marker 0 intro",
        "  x-detail 1",
        "  air down",
        "tap 384 0-3",
        "  x-glow",
        "  air up",
      ],
      ["&x-editor=1", "&lv_3=13", "&unknown=value"],
    );
    for (const mirror of [false, true])
      expect(
        parsedDifferences(
          parseLxchu(plain, { difficulty: 3, mirror }),
          parseLxchu(extended, { difficulty: 3, mirror }),
        ),
      ).toEqual([]);
  });
  it("accepts CRLF line ends", () => {
    const lf = lxchu(["bpm 0 120", "hold 384..768 0-3", "  airhold -> 1152"]);
    const crlf = new TextEncoder().encode(new TextDecoder().decode(lf).replace(/\n/g, "\r\n"));
    expect(
      parsedDifferences(
        parseLxchu(lf, { difficulty: 3, mirror: false }),
        parseLxchu(crlf, { difficulty: 3, mirror: false }),
      ),
    ).toEqual([]);
  });
  it("reports malformed lines with their line numbers", () => {
    const line = (body: string[]) => lxchu(["bpm 0 120", ...body]);
    expectLineError(line(["drag 384 0-3"]), 6);
    expectLineError(line(["  air up"]), 6);
    expectLineError(line(["tap 384 0-3", "  air up", "  airhold -> 480"]), 8);
    expectLineError(line(["tap 384 0-3", "  airhold -> 480", "  airhold pink -> 576"]), 8);
    expectLineError(line(["tap 384 0-3", "  spin"]), 7);
    expectLineError(line(["crush 384 0-3 h1 ~> 480 0-3 h1"]), 6);
    expectLineError(line(["tap 384 0-3", "bpm 480 150"]), 7);
    expectLineError(line(["tap 384 0-16"]), 6);
    expectLineError(line(["hold 480..384 0-3"]), 6);
    expectLineError(line(["slide 384 0-3"]), 6);
    expectLineError(line(["tap 384 0-3 extra"]), 6);
    expectLineError(lxchu(["bpm 0 120"], ["&combo_bpm_3=0"]), 3);
  });
});
