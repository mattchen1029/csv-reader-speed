// Fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01).
// Same answers, byte for byte (see v1 comments for the policy).
// Speed: most records take the fast path -- one indexOf('\n') per record
// to find its end, then one indexOf(',') per unquoted field and one
// indexOf('"') per quoted field, one slice per field. No per-field LF/CR
// scans: a record is fast only when its first physical line holds no CR
// other than a trailing CRLF one, so no stray CR and no CR inside quotes
// can hide in it. Anything else (multiline quoted field, stray CR, quote
// junk, unterminated quote) falls back to the precise slow parser.
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;
  let recordLine = 1;
  let recordRow = null;
  let fValue = '';
  let fEnded = 0;
  let fQuoted = false;

  function readUnquoted(init) {
    for (;;) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let end, ended;
      if (comma === -1 && lf === -1) { end = n; ended = 2; }
      else if (comma === -1) { end = lf; ended = 1; }
      else if (lf === -1) { end = comma; ended = 0; }
      else if (comma < lf) { end = comma; ended = 0; }
      else { end = lf; ended = 1; }
      const cr = text.indexOf('\r', pos);
      if (cr !== -1 && cr < end) {
        if (cr + 1 === end && ended === 1) {
          fValue = init === '' ? text.slice(pos, cr) : init + text.slice(pos, cr);
          pos = end + 1; line += 1; fEnded = 1; return;
        }
        const scanEnd = ended === 1 && end > pos && text.charCodeAt(end - 1) === 13 ? end - 1 : end;
        let v = init; let s = pos; let i = pos;
        while (i < scanEnd) {
          if (text.charCodeAt(i) === 13) {
            if (i > s) v += text.slice(s, i);
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            i += 1; s = i;
          } else i += 1;
        }
        if (scanEnd > s) v += text.slice(s, scanEnd);
        fValue = v;
        if (ended === 1) { pos = end + 1; line += 1; }
        else if (ended === 0) { pos = end + 1; }
        else pos = n;
        fEnded = ended; return;
      }
      fValue = init === '' ? text.slice(pos, end) : init + text.slice(pos, end);
      if (ended === 1) { pos = end + 1; line += 1; }
      else if (ended === 0) { pos = end + 1; }
      else pos = n;
      fEnded = ended; return;
    }
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = pos + 1;
    let close = -1;
    let hasDouble = false;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) { hasDouble = true; p = q + 2; continue; }
      close = q; break;
    }
    if (close === -1) {
      pos = open + 1; line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"'); return;
    }
    let value;
    const crIn = text.indexOf('\r', open + 1);
    const lfIn = text.indexOf('\n', open + 1);
    if (!hasDouble && (crIn === -1 || crIn >= close) && (lfIn === -1 || lfIn >= close)) {
      value = text.slice(open + 1, close);
    } else {
      let v = ''; let i = open + 1;
      while (i < close) {
        const c = text.charCodeAt(i);
        if (c === 34) { v += '"'; i += 2; continue; }
        if (c === 13) { v += '\n'; line += 1; i += text.charCodeAt(i + 1) === 10 ? 2 : 1; continue; }
        if (c === 10) { v += '\n'; line += 1; i += 1; continue; }
        v += text[i]; i += 1;
      }
      value = v;
    }
    pos = close + 1;
    if (pos >= n) { fValue = value; fEnded = 2; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; fValue = value; fEnded = 0; return; }
    if (c === 10) { pos += 1; line += 1; fValue = value; fEnded = 1; return; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; fValue = value; fEnded = 1; return; }
    readUnquoted(value);
    if (fValue.length > value.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  // Parse one record with the precise (slow) parser. Returns its fields.
  function slowRecord() {
    const fields = [];
    for (;;) {
      if (text.charCodeAt(pos) === 34) { fQuoted = true; readQuoted(); }
      else { fQuoted = false; readUnquoted(''); }
      fields.push(fValue);
      if (fEnded !== 0) break;
    }
    return fields;
  }

  // Try the fast path for the record starting at pos. On success it
  // advances pos/line and returns the fields; on any broken case it
  // returns null without changing pos, line or errors. Unlike v2 it also
  // handles quoted fields that span physical lines: after such a field
  // it recomputes the record's line end for the continuation line.
  function fastRecord() {
    const start = pos;
    const startLine = line;
    let lfIdx = text.indexOf('\n', start);
    let lineEnd = lfIdx === -1 ? n : lfIdx;
    let hasLF = lfIdx !== -1;
    let internalLines = 0;
    const crPos = text.indexOf('\r', start);
    if (crPos !== -1 && crPos < lineEnd) {
      if (!(hasLF && crPos === lineEnd - 1)) return null;
      if (!hasLF) return null;
    }
    const fields = [];
    let p = start;
    for (;;) {
      if (text.charCodeAt(p) === 34) {
        fQuoted = true;
        const open = p;
        let q0 = p + 1;
        let parts = null;
        let close = -1;
        let hasDouble = false;
        for (;;) {
          const q = text.indexOf('"', q0);
          if (q === -1) return null; // unterminated
          if (text.charCodeAt(q + 1) === 34) {
            hasDouble = true;
            if (parts === null) parts = [];
            parts.push(text.slice(q0, q + 1));
            q0 = q + 2; continue;
          }
          close = q; break;
        }
        let value;
        if (close < lineEnd) {
          // No LF inside (lineEnd is the first LF), and the record's
          // first line is CR-clean, so no CR inside either. Only doubled
          // quotes need work, and the scan already collected them.
          if (!hasDouble) value = text.slice(open + 1, close);
          else { parts.push(text.slice(q0, close)); value = parts.join(''); }
        } else {
          // Multiline quoted field: chunked build, doubled quotes collapse,
          // CR/CRLF/LF inside -> LF, counting the lines it spans.
          const ps = [];
          let i = open + 1;
          while (i < close) {
            const q = text.indexOf('"', i);
            const r = text.indexOf('\r', i);
            const l = text.indexOf('\n', i);
            let m = close; let kind = 0;
            if (q !== -1 && q < m) { m = q; kind = 1; }
            if (r !== -1 && r < m) { m = r; kind = 2; }
            if (l !== -1 && l < m) { m = l; kind = 3; }
            if (kind === 0) { ps.push(text.slice(i, close)); break; }
            if (kind === 1) { ps.push(text.slice(i, m + 1)); i = m + 2; continue; }
            if (kind === 2) { ps.push(text.slice(i, m)); ps.push('\n'); internalLines += 1; i = m + (text.charCodeAt(m + 1) === 10 ? 2 : 1); continue; }
            ps.push(text.slice(i, m)); ps.push('\n'); internalLines += 1; i = m + 1;
          }
          value = ps.length === 1 ? ps[0] : ps.join('');
        }
        const nxt = close + 1;
        if (nxt > lineEnd) {
          // The quoted field spanned physical lines: recompute the
          // continuation line's end and its CR cleanliness.
          lfIdx = text.indexOf('\n', nxt);
          lineEnd = lfIdx === -1 ? n : lfIdx;
          hasLF = lfIdx !== -1;
          const cr2 = text.indexOf('\r', nxt);
          if (cr2 !== -1 && cr2 < lineEnd) {
            if (!(hasLF && cr2 === lineEnd - 1)) return null;
            if (!hasLF) return null;
          }
        }
        if (nxt >= n) { fields.push(value); pos = n; line = startLine + internalLines; return fields; }
        if (nxt === lineEnd) { fields.push(value); pos = lineEnd + 1; line = startLine + internalLines + 1; return fields; }
        const nc = text.charCodeAt(nxt);
        if (nc === 44) { fields.push(value); p = nxt + 1; continue; }
        if (nc === 13 && nxt + 1 === lineEnd) { fields.push(value); pos = lineEnd + 1; line = startLine + internalLines + 1; return fields; }
        return null; // quote junk
      }
      fQuoted = false;
      const comma = text.indexOf(',', p);
      if (comma === -1 || comma >= lineEnd) {
        let end = lineEnd;
        if (hasLF && end > p && text.charCodeAt(end - 1) === 13) end -= 1;
        fields.push(text.slice(p, end));
        if (hasLF) { pos = lineEnd + 1; line = startLine + internalLines + 1; } else { pos = n; line = startLine + internalLines; }
        return fields;
      }
      fields.push(text.slice(p, comma));
      p = comma + 1;
    }
  }

  for (;;) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    let fields = fastRecord();
    if (fields === null) fields = slowRecord();
    // A line left with a single empty unquoted field is no record
    // (a lone stray-CR line; its errors stay). fQuoted is the last
    // field's quoted flag in both the fast and the slow path.
    if (fields.length === 1 && fields[0] === '' && !fQuoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
