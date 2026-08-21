// Deterministic formula parser/interpreter. No eval, Function, or arbitrary code execution.
window.Daxxer = window.Daxxer || {};

(function () {
  const MAX_EXPRESSION = 2048;
  const MAX_TOKENS = 512;
  const MAX_DEPTH = 64;

  class FormulaError extends Error {
    constructor(code, message, position = null) {
      super(message);
      this.name = "FormulaError";
      this.code = code;
      this.position = position;
    }
  }

  function tokenize(source) {
    if (typeof source !== "string") throw new FormulaError("formula_type", "Formula expression must be a string.");
    if (source.length > MAX_EXPRESSION) throw new FormulaError("formula_too_long", `Formula exceeds ${MAX_EXPRESSION} characters.`);
    const tokens = [];
    let i = 0;
    const push = (type, value, start) => {
      tokens.push({ type, value, position: start });
      if (tokens.length > MAX_TOKENS) throw new FormulaError("formula_too_complex", `Formula exceeds ${MAX_TOKENS} tokens.`, start);
    };

    while (i < source.length) {
      const ch = source[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      const start = i;

      if (/[0-9.]/.test(ch) && (/[0-9]/.test(ch) || /[0-9]/.test(source[i + 1] || ""))) {
        let text = "";
        let dots = 0;
        while (i < source.length && /[0-9.]/.test(source[i])) {
          if (source[i] === ".") dots += 1;
          text += source[i++];
        }
        if (dots > 1 || !/^\d*\.?\d+$/.test(text)) throw new FormulaError("formula_number", `Invalid number '${text}'.`, start);
        push("number", Number(text), start);
        continue;
      }

      if (ch === '"' || ch === "'") {
        const quote = ch;
        i += 1;
        let text = "";
        let closed = false;
        while (i < source.length) {
          const c = source[i++];
          if (c === quote) { closed = true; break; }
          if (c === "\\") {
            if (i >= source.length) break;
            const escaped = source[i++];
            const map = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
            text += Object.prototype.hasOwnProperty.call(map, escaped) ? map[escaped] : escaped;
          } else text += c;
        }
        if (!closed) throw new FormulaError("formula_string", "Unterminated string literal.", start);
        push("string", text, start);
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        let name = "";
        while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) name += source[i++];
        push("identifier", name, start);
        continue;
      }

      const two = source.slice(i, i + 2);
      if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
        push("operator", two, start); i += 2; continue;
      }
      if (["+", "-", "*", "/", "%", ">", "<", "!"].includes(ch)) {
        push("operator", ch, start); i += 1; continue;
      }
      if (ch === "(") { push("lparen", ch, start); i += 1; continue; }
      if (ch === ")") { push("rparen", ch, start); i += 1; continue; }
      if (ch === ",") { push("comma", ch, start); i += 1; continue; }
      throw new FormulaError("formula_token", `Unexpected character '${ch}'.`, start);
    }
    push("eof", null, source.length);
    return tokens;
  }

  function parse(source) {
    const tokens = tokenize(source);
    let index = 0;
    let depth = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];
    const expect = (type, value = null) => {
      const token = take();
      if (!token || token.type !== type || (value != null && token.value !== value)) {
        const found = token ? `${token.type}${token.value != null ? ` '${token.value}'` : ""}` : "end of input";
        throw new FormulaError("formula_syntax", `Expected ${value || type}, found ${found}.`, token ? token.position : source.length);
      }
      return token;
    };
    const withDepth = (fn) => {
      depth += 1;
      if (depth > MAX_DEPTH) throw new FormulaError("formula_too_deep", `Formula nesting exceeds ${MAX_DEPTH}.`, peek().position);
      try { return fn(); } finally { depth -= 1; }
    };

    function primary() {
      return withDepth(() => {
        const token = peek();
        if (token.type === "number" || token.type === "string") { take(); return { type: "literal", value: token.value, position: token.position }; }
        if (token.type === "identifier") {
          take();
          if (token.value === "true" || token.value === "false" || token.value === "null") {
            return { type: "literal", value: token.value === "null" ? null : token.value === "true", position: token.position };
          }
          if (peek().type !== "lparen") throw new FormulaError("formula_identifier", `Unknown identifier '${token.value}'.`, token.position);
          take();
          const args = [];
          if (peek().type !== "rparen") {
            while (true) {
              args.push(expression());
              if (peek().type !== "comma") break;
              take();
            }
          }
          expect("rparen");
          return { type: "call", name: token.value, args, position: token.position };
        }
        if (token.type === "lparen") {
          take();
          const node = expression();
          expect("rparen");
          return node;
        }
        throw new FormulaError("formula_syntax", "Expected a value or function call.", token.position);
      });
    }

    function unary() {
      const token = peek();
      if (token.type === "operator" && (token.value === "!" || token.value === "-" || token.value === "+")) {
        take(); return { type: "unary", op: token.value, value: unary(), position: token.position };
      }
      return primary();
    }

    function binary(next, operators) {
      let node = next();
      while (peek().type === "operator" && operators.includes(peek().value)) {
        const op = take();
        node = { type: "binary", op: op.value, left: node, right: next(), position: op.position };
      }
      return node;
    }

    const factor = () => binary(unary, ["*", "/", "%"]);
    const term = () => binary(factor, ["+", "-"]);
    const comparison = () => binary(term, [">", ">=", "<", "<="]);
    const equality = () => binary(comparison, ["==", "!="]);
    const and = () => binary(equality, ["&&"]);
    const or = () => binary(and, ["||"]);
    function expression() { return or(); }

    const ast = expression();
    expect("eof");
    return ast;
  }

  function numeric(value, position) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) throw new FormulaError("formula_number", "Expected a finite number.", position);
    return n;
  }

  const builtins = {
    concat: (...args) => args.map((value) => value == null ? "" : String(value)).join(""),
    lower: (value) => String(value == null ? "" : value).toLowerCase(),
    upper: (value) => String(value == null ? "" : value).toUpperCase(),
    length: (value) => value == null ? 0 : (Array.isArray(value) || typeof value === "string" ? value.length : String(value).length),
    abs: (value) => Math.abs(numeric(value)),
    min: (...args) => Math.min(...args.map((value) => numeric(value))),
    max: (...args) => Math.max(...args.map((value) => numeric(value))),
    empty: (value) => value == null || value === "" || (Array.isArray(value) && value.length === 0),
    round: (value, digits = 0) => {
      const n = numeric(value);
      const d = Math.max(-10, Math.min(10, Math.trunc(numeric(digits))));
      const factor = 10 ** d;
      return Math.round(n * factor) / factor;
    },
  };

  function evaluateAst(ast, context, level = 0) {
    if (level > MAX_DEPTH) throw new FormulaError("formula_too_deep", `Formula evaluation exceeds ${MAX_DEPTH}.`, ast.position);
    if (ast.type === "literal") return ast.value;
    if (ast.type === "unary") {
      const value = evaluateAst(ast.value, context, level + 1);
      if (ast.op === "!") return !value;
      if (ast.op === "-") return -numeric(value, ast.position);
      if (ast.op === "+") return numeric(value, ast.position);
    }
    if (ast.type === "binary") {
      if (ast.op === "&&") {
        const left = evaluateAst(ast.left, context, level + 1);
        return left ? evaluateAst(ast.right, context, level + 1) : left;
      }
      if (ast.op === "||") {
        const left = evaluateAst(ast.left, context, level + 1);
        return left ? left : evaluateAst(ast.right, context, level + 1);
      }
      const left = evaluateAst(ast.left, context, level + 1);
      const right = evaluateAst(ast.right, context, level + 1);
      if (ast.op === "+") {
        if (typeof left === "string" || typeof right === "string") return String(left == null ? "" : left) + String(right == null ? "" : right);
        return numeric(left, ast.position) + numeric(right, ast.position);
      }
      if (ast.op === "-") return numeric(left, ast.position) - numeric(right, ast.position);
      if (ast.op === "*") return numeric(left, ast.position) * numeric(right, ast.position);
      if (ast.op === "/") {
        const divisor = numeric(right, ast.position);
        if (divisor === 0) throw new FormulaError("formula_divide_by_zero", "Division by zero.", ast.position);
        return numeric(left, ast.position) / divisor;
      }
      if (ast.op === "%") {
        const divisor = numeric(right, ast.position);
        if (divisor === 0) throw new FormulaError("formula_divide_by_zero", "Modulo by zero.", ast.position);
        return numeric(left, ast.position) % divisor;
      }
      if (ast.op === "==") return left === right;
      if (ast.op === "!=") return left !== right;
      if (ast.op === ">") return left > right;
      if (ast.op === ">=") return left >= right;
      if (ast.op === "<") return left < right;
      if (ast.op === "<=") return left <= right;
    }
    if (ast.type === "call") {
      if (ast.name === "if") {
        if (ast.args.length !== 3) throw new FormulaError("formula_arity", "if() requires exactly 3 arguments.", ast.position);
        return evaluateAst(ast.args[0], context, level + 1)
          ? evaluateAst(ast.args[1], context, level + 1)
          : evaluateAst(ast.args[2], context, level + 1);
      }
      if (ast.name === "prop") {
        if (ast.args.length !== 1) throw new FormulaError("formula_arity", "prop() requires exactly 1 argument.", ast.position);
        const key = evaluateAst(ast.args[0], context, level + 1);
        if (typeof key !== "string") throw new FormulaError("formula_property", "prop() requires a property name or ID string.", ast.position);
        if (!context || typeof context.getProperty !== "function") throw new FormulaError("formula_context", "Property access is unavailable.", ast.position);
        return context.getProperty(key);
      }
      const fn = builtins[ast.name];
      if (!fn) throw new FormulaError("formula_function", `Unknown function '${ast.name}'.`, ast.position);
      const args = ast.args.map((arg) => evaluateAst(arg, context, level + 1));
      try { return fn(...args); }
      catch (error) {
        if (error instanceof FormulaError) throw error;
        throw new FormulaError("formula_evaluation", error.message || "Formula evaluation failed.", ast.position);
      }
    }
    throw new FormulaError("formula_ast", "Unsupported formula node.", ast.position);
  }

  function normalizeError(error) {
    if (error instanceof FormulaError) return { code: error.code, message: error.message, position: error.position };
    return { code: "formula_evaluation", message: error && error.message ? error.message : "Formula evaluation failed.", position: null };
  }

  function evaluate(source, context = {}) {
    try {
      const ast = parse(source || "");
      const value = evaluateAst(ast, context);
      if (typeof value === "number" && !Number.isFinite(value)) throw new FormulaError("formula_number", "Formula produced a non-finite number.");
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    }
  }

  Daxxer.FormulaEngine = { evaluate, parse, tokenize, FormulaError };
})();
