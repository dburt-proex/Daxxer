// Pure table-block model. Cells are local text values; block.text is a derived
// searchable projection so DaxxerOS Local's existing block flattener indexes them.
window.Daxxer = window.Daxxer || {};

(function () {
  const MAX_COLUMNS = 20;
  const MAX_ROWS = 200;

  function create(rows = 2, columns = 2) {
    const rowCount = Math.max(1, Math.min(MAX_ROWS, Math.trunc(rows) || 2));
    const columnCount = Math.max(1, Math.min(MAX_COLUMNS, Math.trunc(columns) || 2));
    return {
      columns: columnCount,
      headerRow: false,
      headerColumn: false,
      rows: Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => "")),
    };
  }

  function validate(table) {
    const errors = [];
    if (!table || typeof table !== "object" || Array.isArray(table)) return [{ code: "table_invalid" }];
    if (!Number.isInteger(table.columns) || table.columns < 1 || table.columns > MAX_COLUMNS) {
      errors.push({ code: "table_columns_invalid", value: table.columns });
      return errors;
    }
    if (!Array.isArray(table.rows) || table.rows.length < 1 || table.rows.length > MAX_ROWS) {
      errors.push({ code: "table_rows_invalid" });
      return errors;
    }
    table.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== table.columns) {
        errors.push({ code: "table_row_width_invalid", rowIndex });
        return;
      }
      row.forEach((cell, columnIndex) => {
        if (typeof cell !== "string") errors.push({ code: "table_cell_invalid", rowIndex, columnIndex });
      });
    });
    if (table.headerRow != null && typeof table.headerRow !== "boolean") errors.push({ code: "table_header_row_invalid" });
    if (table.headerColumn != null && typeof table.headerColumn !== "boolean") errors.push({ code: "table_header_column_invalid" });
    return errors;
  }

  function textProjection(table) {
    if (validate(table).length) return "";
    return table.rows.map((row) => row.join("\t")).join("\n");
  }

  function syncBlock(block) {
    if (!block || block.type !== "table") return { ok: false, errors: [{ code: "not_table_block" }] };
    const errors = validate(block.table);
    if (errors.length) return { ok: false, errors };
    block.text = textProjection(block.table);
    block.richText = block.text ? [{ text: block.text, marks: {}, href: null }] : [];
    block.schemaVersion = 1;
    return { ok: true, block };
  }

  function setCell(block, rowIndex, columnIndex, value) {
    const checked = syncBlock(block);
    if (!checked.ok) return checked;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= block.table.rows.length) return { ok: false, errors: [{ code: "table_row_out_of_range" }] };
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= block.table.columns) return { ok: false, errors: [{ code: "table_column_out_of_range" }] };
    if (typeof value !== "string") return { ok: false, errors: [{ code: "table_cell_invalid" }] };
    block.table.rows[rowIndex][columnIndex] = value;
    return syncBlock(block);
  }

  function addRow(block) {
    const checked = syncBlock(block);
    if (!checked.ok) return checked;
    if (block.table.rows.length >= MAX_ROWS) return { ok: false, errors: [{ code: "table_row_limit" }] };
    block.table.rows.push(Array.from({ length: block.table.columns }, () => ""));
    return syncBlock(block);
  }

  function addColumn(block) {
    const checked = syncBlock(block);
    if (!checked.ok) return checked;
    if (block.table.columns >= MAX_COLUMNS) return { ok: false, errors: [{ code: "table_column_limit" }] };
    block.table.columns += 1;
    block.table.rows.forEach((row) => row.push(""));
    return syncBlock(block);
  }

  function removeRow(block, rowIndex) {
    const checked = syncBlock(block);
    if (!checked.ok) return checked;
    if (block.table.rows.length <= 1) return { ok: false, errors: [{ code: "table_min_rows" }] };
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= block.table.rows.length) return { ok: false, errors: [{ code: "table_row_out_of_range" }] };
    block.table.rows.splice(rowIndex, 1);
    return syncBlock(block);
  }

  function removeColumn(block, columnIndex) {
    const checked = syncBlock(block);
    if (!checked.ok) return checked;
    if (block.table.columns <= 1) return { ok: false, errors: [{ code: "table_min_columns" }] };
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= block.table.columns) return { ok: false, errors: [{ code: "table_column_out_of_range" }] };
    block.table.columns -= 1;
    block.table.rows.forEach((row) => row.splice(columnIndex, 1));
    return syncBlock(block);
  }

  function toggleHeader(block, kind) {
    const checked = syncBlock(block);
    if (!checked.ok) return checked;
    if (kind === "row") block.table.headerRow = !block.table.headerRow;
    else if (kind === "column") block.table.headerColumn = !block.table.headerColumn;
    else return { ok: false, errors: [{ code: "table_header_kind_invalid" }] };
    return syncBlock(block);
  }

  Daxxer.TableBlock = {
    MAX_COLUMNS, MAX_ROWS, create, validate, textProjection, syncBlock,
    setCell, addRow, addColumn, removeRow, removeColumn, toggleHeader,
  };
})();
