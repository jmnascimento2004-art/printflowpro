import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  formatPdfCurrencyCell,
  getPdfDescriptionFontSize,
  normalizePdfCellText
} from './pdf-cell-text.mjs';
import { buildPdfItemViewModel } from './pdf-item-view-model.mjs';

export const PDF_PRODUCT_COLUMN_WIDTHS = Object.freeze({
  quantity: '8%',
  description: '46%',
  size: '16%',
  unit: '15%',
  total: '15%'
});

const styles = StyleSheet.create({
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d8dee9',
    borderRadius: 6,
    overflow: 'hidden'
  },
  header: { flexDirection: 'row', backgroundColor: '#050505', color: '#ffffff' },
  headerCell: { paddingVertical: 7, paddingHorizontal: 4, fontSize: 8, fontWeight: 700 },
  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e8edf5' },
  cell: { paddingVertical: 6, paddingHorizontal: 4, lineHeight: 1.2, fontSize: 9 },
  quantity: { width: PDF_PRODUCT_COLUMN_WIDTHS.quantity, textAlign: 'center' },
  description: { width: PDF_PRODUCT_COLUMN_WIDTHS.description, textAlign: 'left', fontWeight: 500 },
  size: { width: PDF_PRODUCT_COLUMN_WIDTHS.size, textAlign: 'center', fontSize: 8.5 },
  unit: { width: PDF_PRODUCT_COLUMN_WIDTHS.unit, textAlign: 'right', fontSize: 8.5 },
  total: { width: PDF_PRODUCT_COLUMN_WIDTHS.total, textAlign: 'right', fontSize: 8.5 }
});

function cell(text, style) {
  return React.createElement(Text, { style, wrap: false }, normalizePdfCellText(text));
}

export function PdfProductTable({ items }) {
  const header = React.createElement(
    View,
    { style: styles.header, fixed: true },
    cell('QTD', [styles.headerCell, styles.quantity]),
    cell('DESCRIÇÃO', [styles.headerCell, styles.description]),
    cell('TAMANHO', [styles.headerCell, styles.size]),
    cell('UNIT', [styles.headerCell, styles.unit]),
    cell('TOTAL', [styles.headerCell, styles.total])
  );

  const rows = items.map((item) => {
    const viewModel = buildPdfItemViewModel(item);
    const description = normalizePdfCellText(viewModel.description);

    return React.createElement(
      View,
      { key: item.id, style: styles.row, wrap: false },
      cell(viewModel.quantity, [styles.cell, styles.quantity]),
      cell(description, [
        styles.cell,
        styles.description,
        { fontSize: getPdfDescriptionFontSize(description) }
      ]),
      cell(viewModel.size, [styles.cell, styles.size]),
      cell(formatPdfCurrencyCell(viewModel.unitPrice, { maximumFractionDigits: 4 }), [styles.cell, styles.unit]),
      cell(formatPdfCurrencyCell(viewModel.totalPrice), [styles.cell, styles.total])
    );
  });

  return React.createElement(View, { style: styles.table }, header, ...rows);
}
