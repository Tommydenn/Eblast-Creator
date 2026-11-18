/**
 * Cut a .sql file into the statements it holds.
 *
 * The connection the app uses sends each statement as a prepared statement,
 * and Postgres allows exactly one command in one of those. So a file holding
 * three statements has to arrive as three requests, and the only way to know
 * where one ends is to read the file the way Postgres would: a semicolon ends
 * a statement unless it is inside a string, a quoted name, a comment, or a
 * dollar-quoted body.
 *
 * Splitting on /;/ alone was the bug this replaces — it cut a function body
 * in half the first time one appeared — so the scanner below walks the text
 * once and skips over everything a semicolon can legally hide in.
 */

/** Everything that is only a comment, for deciding whether a chunk is empty. */
function withoutComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").trim();
}

export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    // -- to the end of the line
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      const stop = nl === -1 ? sql.length : nl;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // /* ... */, which Postgres allows to nest
    if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.slice(j, j + 2) === "/*") { depth++; j += 2; continue; }
        if (sql.slice(j, j + 2) === "*/") { depth--; j += 2; continue; }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    // 'a string' or "a quoted name"; the quote is doubled to escape it
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    // $$ ... $$ or $tag$ ... $tag$, which is how function bodies are written
    if (ch === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const j = end === -1 ? sql.length : end + tag.length;
        buf += sql.slice(i, j);
        i = j;
        continue;
      }
    }

    if (ch === ";") {
      out.push(buf);
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  out.push(buf);

  // A trailing chunk of nothing but the file's closing comment is not a
  // statement, and sending it would be an error rather than a no-op.
  return out.map((s) => s.trim()).filter((s) => withoutComments(s).length > 0);
}
