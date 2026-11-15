// A small GLSL interpreter for the full-screen filter shaders, used to run their real source on the CPU in tests.

type Value = number | number[];

export interface TestImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row 0 at the bottom (texture coordinate v = 0). */
  readonly data: Float32Array;
  readonly filter: "linear" | "nearest";
  readonly channels?: number;
}

type Token = { kind: "num" | "id" | "op"; text: string };

const OPERATORS = ["<=", ">=", "==", "!=", "&&", "||", "+=", "-=", "*=", "/="];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const clean = source
    .replace(/\/\/[^\n]*/g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const number = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(clean.slice(i));
    if (number) {
      tokens.push({ kind: "num", text: number[0] });
      i += number[0].length;
      continue;
    }
    const id = /^[A-Za-z_]\w*/.exec(clean.slice(i));
    if (id) {
      tokens.push({ kind: "id", text: id[0] });
      i += id[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => clean.startsWith(o, i));
    if (op) {
      tokens.push({ kind: "op", text: op });
      i += op.length;
      continue;
    }
    tokens.push({ kind: "op", text: c });
    i++;
  }
  return tokens;
}

type Expr = (scope: Scope) => Value;
type Stmt = (scope: Scope) => "next" | "return";

interface Scope {
  readonly vars: Map<string, Value>;
  readonly parent: Scope | null;
  result: Value | undefined;
}

const TYPES = new Set(["float", "int", "bool", "vec2", "vec3", "vec4", "void"]);
const SWIZZLE = /^[xyzwrgba]+$/;
const INDEX: Record<string, number> = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };

function lookup(scope: Scope, name: string): Scope {
  for (let s: Scope | null = scope; s; s = s.parent) if (s.vars.has(name)) return s;
  throw new Error(`undefined ${name}`);
}

const zeroOf = (type: string): Value =>
  type === "vec2" ? [0, 0] : type === "vec3" ? [0, 0, 0] : type === "vec4" ? [0, 0, 0, 0] : 0;
const arr = (v: Value) => (Array.isArray(v) ? v : [v]);
function binary(op: string, a: Value, b: Value): Value {
  const fn = (x: number, y: number): number => {
    switch (op) {
      case "+":
        return x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        return x / y;
      case "<":
        return x < y ? 1 : 0;
      case ">":
        return x > y ? 1 : 0;
      case "<=":
        return x <= y ? 1 : 0;
      case ">=":
        return x >= y ? 1 : 0;
      case "==":
        return x === y ? 1 : 0;
      case "!=":
        return x !== y ? 1 : 0;
      case "&&":
        return x && y ? 1 : 0;
      case "||":
        return x || y ? 1 : 0;
    }
    throw new Error(`operator ${op}`);
  };
  if (!Array.isArray(a) && !Array.isArray(b)) return fn(a, b as number);
  const n = Math.max(arr(a).length, arr(b).length);
  const x = arr(a);
  const y = arr(b);
  if (x.length !== 1 && y.length !== 1 && x.length !== y.length) throw new Error("size mismatch");
  return Array.from({ length: n }, (_, i) =>
    fn(x[x.length === 1 ? 0 : i], y[y.length === 1 ? 0 : i]),
  );
}

function sample(image: TestImage, u: number, v: number): number[] {
  const read = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, 0), image.width - 1);
    const cy = Math.min(Math.max(y, 0), image.height - 1);
    const at = (cy * image.width + cx) * 4;
    return [image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]];
  };
  const px = u * image.width;
  const py = v * image.height;
  if (image.filter === "nearest") return read(Math.floor(px), Math.floor(py));
  const fx = px - 0.5;
  const fy = py - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = read(x0, y0);
  const b = read(x0 + 1, y0);
  const c = read(x0, y0 + 1);
  const d = read(x0 + 1, y0 + 1);
  return a.map(
    (_, i) => (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty,
  );
}

export interface ShaderRun {
  /** Runs `main` at the pixel centre `(x, y)` of a target of the given size (row 0 at the bottom). */
  pixel(x: number, y: number, width: number, height: number): number[];
}

/** Builds a runnable shader from source, its sampler images and its uniform values. */
export function compileTestShader(
  source: string,
  environment: { samplers: Record<string, TestImage>; uniforms: Record<string, Value> },
): ShaderRun {
  const tokens = tokenize(source);
  let at = 0;
  const peek = (offset = 0) => tokens[at + offset]?.text;
  const next = () => tokens[at++];
  const expect = (text: string) => {
    const t = next();
    if (t?.text !== text) throw new Error(`expected ${text}, got ${t?.text} near ${at}`);
  };
  const functions = new Map<string, { params: string[]; body: Stmt }>();
  const globals: Scope = { vars: new Map(), parent: null, result: undefined };
  const builtins: Record<string, (...args: Value[]) => Value> = {
    dot: (a, b) => arr(a).reduce((s, v, i) => s + v * arr(b)[i], 0),
    abs: (a) => (Array.isArray(a) ? a.map(Math.abs) : Math.abs(a)),
    floor: (a) => (Array.isArray(a) ? a.map(Math.floor) : Math.floor(a)),
    min: (a, b) => map2(a, b, Math.min),
    max: (a, b) => map2(a, b, Math.max),
    step: (e, x) => map2(e, x, (edge, value) => (value >= edge ? 1 : 0)),
  };
  const map2 = (a: Value, b: Value, fn: (x: number, y: number) => number): Value => {
    if (!Array.isArray(a) && !Array.isArray(b)) return fn(a, b as number);
    const n = Math.max(arr(a).length, arr(b).length);
    return Array.from({ length: n }, (_, i) =>
      fn(arr(a)[arr(a).length === 1 ? 0 : i], arr(b)[arr(b).length === 1 ? 0 : i]),
    );
  };

  const construct = (type: string, args: Value[]): Value => {
    const size = type === "vec2" ? 2 : type === "vec3" ? 3 : 4;
    const flat = args.flatMap(arr);
    if (flat.length === 1) return Array(size).fill(flat[0]);
    if (flat.length < size) throw new Error(`${type} needs ${size} components`);
    return flat.slice(0, size);
  };

  function parsePrimary(): Expr {
    const t = next();
    if (t.kind === "num") {
      const v = Number(t.text);
      return () => v;
    }
    if (t.text === "(") {
      const e = parseExpr();
      expect(")");
      return parsePostfix(e);
    }
    if (t.text === "-") {
      const e = parseUnary();
      return (s) => binary("-", 0, e(s)) as Value;
    }
    if (t.kind !== "id") throw new Error(`unexpected ${t.text}`);
    const name = t.text;
    if (peek() === "(") {
      next();
      const args: Expr[] = [];
      while (peek() !== ")") {
        args.push(parseExpr());
        if (peek() === ",") next();
      }
      expect(")");
      return parsePostfix((s) =>
        call(
          name,
          args.map((a) => a(s)),
        ),
      );
    }
    return parsePostfix((s) => lookup(s, name).vars.get(name)!);
  }
  function parsePostfix(e: Expr): Expr {
    while (peek() === "." && SWIZZLE.test(tokens[at + 1]?.text ?? "")) {
      next();
      const sw = next().text;
      const inner = e;
      e = (s) => {
        const v = inner(s) as number[];
        const picked = [...sw].map((ch) => v[INDEX[ch]]);
        return picked.length === 1 ? picked[0] : picked;
      };
    }
    return e;
  }
  function parseUnary(): Expr {
    if (peek() === "-") {
      next();
      const e = parseUnary();
      return (s) => binary("-", 0, e(s));
    }
    if (peek() === "!") {
      next();
      const e = parseUnary();
      return (s) => (e(s) ? 0 : 1);
    }
    return parsePrimary();
  }
  const levels = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/"]];
  function parseLevel(level: number): Expr {
    if (level === levels.length) return parseUnary();
    let left = parseLevel(level + 1);
    while (levels[level].includes(peek())) {
      const op = next().text;
      const right = parseLevel(level + 1);
      const l = left;
      left = (s) => binary(op, l(s), right(s));
    }
    return left;
  }
  function parseExpr(): Expr {
    return parseLevel(0);
  }

  function call(name: string, args: Value[]): Value {
    if (TYPES.has(name)) {
      if (name === "float") return arr(args[0])[0];
      return construct(name, args);
    }
    const user = functions.get(name);
    if (user) {
      const frame: Scope = { vars: new Map(), parent: globals, result: undefined };
      user.params.forEach((p, i) => frame.vars.set(p, args[i]));
      user.body(frame);
      return frame.result!;
    }
    if (name === "texture" || name === "textureLod") {
      const image = environment.samplers[args[0] as unknown as string];
      const uv = args[1] as number[];
      return sample(image, uv[0], uv[1]);
    }
    const builtin = builtins[name];
    if (!builtin) throw new Error(`unknown function ${name}`);
    return builtin(...args);
  }

  // samplers are passed by name: a sampler variable evaluates to its own name
  for (const name of Object.keys(environment.samplers))
    globals.vars.set(name, name as unknown as Value);

  function parseBlock(): Stmt {
    expect("{");
    const stmts: Stmt[] = [];
    while (peek() !== "}") stmts.push(parseStmt());
    expect("}");
    return (s) => {
      const inner: Scope = { vars: new Map(), parent: s, result: undefined };
      for (const stmt of stmts) {
        if (stmt(inner) === "return") {
          s.result = inner.result;
          return "return";
        }
      }
      return "next";
    };
  }
  function assignTarget(): (scope: Scope, value: Value) => void {
    const name = next().text;
    let swizzle: string | null = null;
    if (peek() === "." && SWIZZLE.test(tokens[at + 1]?.text ?? "")) {
      next();
      swizzle = next().text;
    }
    const opToken = next().text;
    return (scope, value) => {
      const holder = lookup(scope, name);
      const current = holder.vars.get(name)!;
      const combine = (old: Value) => (opToken === "=" ? value : binary(opToken[0], old, value));
      if (!swizzle) {
        holder.vars.set(name, combine(current) as Value);
        return;
      }
      const target = [...(current as number[])];
      const oldPart = [...swizzle].map((ch) => target[INDEX[ch]]);
      const result = arr(combine(oldPart.length === 1 ? oldPart[0] : oldPart));
      [...swizzle].forEach((ch, i) => (target[INDEX[ch]] = result[result.length === 1 ? 0 : i]));
      holder.vars.set(name, target);
    };
  }
  function parseSimple(): Stmt {
    // declaration or assignment without the trailing semicolon
    if (TYPES.has(peek()) || peek() === "const") {
      if (peek() === "const") next();
      const type = next().text;
      const name = next().text;
      let init: Expr | null = null;
      if (peek() === "=") {
        next();
        init = parseExpr();
      }
      return (s) => {
        s.vars.set(name, init ? init(s) : zeroOf(type));
        return "next";
      };
    }
    const target = assignTarget();
    const value = parseExpr();
    return (s) => {
      target(s, value(s));
      return "next";
    };
  }
  function parseStmt(): Stmt {
    const t = peek();
    if (t === "{") return parseBlock();
    if (t === "if") {
      next();
      expect("(");
      const cond = parseExpr();
      expect(")");
      const yes = parseStmt();
      let no: Stmt | null = null;
      if (peek() === "else") {
        next();
        no = parseStmt();
      }
      return (s) => {
        const chosen = cond(s) ? yes : no;
        if (!chosen) return "next";
        const r = chosen(s);
        return r;
      };
    }
    if (t === "return") {
      next();
      const value = peek() === ";" ? null : parseExpr();
      expect(";");
      return (s) => {
        s.result = value ? value(s) : undefined;
        for (let p = s.parent; p && p !== globals; p = p.parent) p.result = s.result;
        return "return";
      };
    }
    if (t === "for") {
      next();
      expect("(");
      const init = parseSimple();
      expect(";");
      const cond = parseExpr();
      expect(";");
      const stepTarget = assignTarget();
      const stepValue = parseExpr();
      expect(")");
      const body = parseStmt();
      return (s) => {
        const loop: Scope = { vars: new Map(), parent: s, result: undefined };
        init(loop);
        for (let guard = 0; cond(loop); guard++) {
          if (guard > 10000) throw new Error("loop too long");
          if (body(loop) === "return") {
            s.result = loop.result;
            return "return";
          }
          stepTarget(loop, stepValue(loop));
        }
        return "next";
      };
    }
    const stmt = parseSimple();
    expect(";");
    return stmt;
  }

  while (at < tokens.length) {
    const t = peek();
    if (t === "precision") {
      while (next().text !== ";");
      continue;
    }
    if (t === "uniform" || t === "in" || t === "out") {
      while (next().text !== ";");
      continue;
    }
    if (t === "const") {
      const stmt = parseSimple();
      expect(";");
      stmt(globals);
      continue;
    }
    // function: type name ( params ) block
    next();
    const name = next().text;
    expect("(");
    const params: string[] = [];
    while (peek() !== ")") {
      next();
      params.push(next().text);
      if (peek() === ",") next();
    }
    expect(")");
    const body = parseBlock();
    functions.set(name, { params, body });
  }

  return {
    pixel(x, y, width, height) {
      const scope: Scope = { vars: new Map(), parent: globals, result: undefined };
      globals.vars.set("uv", [(x + 0.5) / width, (y + 0.5) / height]);
      globals.vars.set("outputColor", [0, 0, 0, 0]);
      for (const [name, value] of Object.entries(environment.uniforms))
        globals.vars.set(name, value);
      functions.get("main")!.body(scope);
      return globals.vars.get("outputColor") as number[];
    },
  };
}
