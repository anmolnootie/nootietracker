import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { POService } from './po.service';

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `Rs. ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * A single-PO PDF for sharing outside the app (with a transporter, a
 * vendor, over email) - the app itself already shows this data across
 * several tabs, but a warehouse or dispatch team member printing/forwarding
 * one PO needs it as one flat document: expiry, dispatch plan, and the full
 * item list with quantity and MRP.
 */
@Injectable()
export class POPdfService {
  constructor(private readonly poService: POService) {}

  async generate(poId: string): Promise<Buffer> {
    const [po, lineItems, timeline] = await Promise.all([
      this.poService.getPOById(poId),
      this.poService.getPOLineItems(poId),
      this.poService.getPOTimeline(poId),
    ]);
    const { appointment, dispatch } = timeline;

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // Positioned .text() calls leave doc.x wherever that call's box ended, not
    // back at the page margin - fixing the left edge once here and passing it
    // explicitly everywhere (instead of ever reading doc.x back) is what
    // keeps every section aligned instead of drifting rightward.
    const pageLeft = doc.page.margins.left;

    doc.fontSize(18).font('Helvetica-Bold').text('Purchase Order', pageLeft, doc.y);
    doc.fontSize(12).font('Helvetica').fillColor('#555').text(po.poNumber, pageLeft, doc.y);
    doc.moveDown(1);
    doc.fillColor('#000');

    this.section(doc, pageLeft, 'PO Details', [
      ['PO Date', formatDate(po.poDate)],
      ['Expiry Date', formatDate(po.poExpiryDate)],
      ['Status', po.status],
      ['PO Value', money(po.poValue)],
      ['Channel', po.channelId],
      ['Customer', po.customerId],
      ['Location', po.location],
      ['Risk Status', po.riskStatus],
    ]);

    if (appointment) {
      this.section(doc, pageLeft, 'Appointment', [
        ['Appointment Date', formatDate(appointment.appointmentDate)],
        ['Appointment Window', appointment.appointmentWindow || '-'],
        ['SLA Status', appointment.slaStatus],
      ]);
    }

    if (dispatch) {
      this.section(doc, pageLeft, 'Dispatch', [
        ['Recommended Dispatch Date', formatDate(dispatch.recommendedDispatchDate)],
        ['Planned Dispatch Date', formatDate(dispatch.plannedDispatchDate)],
        ['Actual Dispatch Date', formatDate(dispatch.actualDispatchDate)],
        ['Dispatch Status', dispatch.dispatchStatus || '-'],
        ['Docket Number', dispatch.docketNumber || '-'],
        ['Transporter', dispatch.transporterId || '-'],
        ['Vehicle Number', dispatch.vehicleNumber || '-'],
        ['Invoice Number', dispatch.invoiceNumber || '-'],
      ]);
    }

    this.itemTable(doc, pageLeft, lineItems);

    doc.moveDown(1.5);
    doc
      .fontSize(8)
      .fillColor('#888')
      .text(`Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, pageLeft, doc.y, { align: 'right' });

    doc.end();
    return done;
  }

  private section(doc: PDFKit.PDFDocument, pageLeft: number, title: string, rows: [string, string][]) {
    if (doc.y > 680) doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#CC5620').text(title, pageLeft, doc.y);
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#000');

    const colWidth = 250;
    let rowStartY = doc.y;
    rows.forEach(([label, value], i) => {
      const col = i % 2;
      if (col === 0) rowStartY = doc.y;
      const x = pageLeft + col * colWidth;
      doc.text(`${label}:`, x, rowStartY, { continued: true, width: colWidth - 10 }).font('Helvetica-Bold').text(` ${value}`).font('Helvetica');
      if (col === 1) doc.moveDown(0.4);
    });
    if (rows.length % 2 === 1) doc.moveDown(0.4);
    doc.x = pageLeft;
    doc.moveDown(0.6);
  }

  private itemTable(
    doc: PDFKit.PDFDocument,
    pageLeft: number,
    lineItems: { skuCode: string; skuName: string; quantity: number; mrp: number | null; unitPrice: number | null; lineValue: number | null; availability: string }[],
  ) {
    if (doc.y > 620) doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#CC5620').text('Item List', pageLeft, doc.y);
    doc.moveDown(0.3);

    const colWidths = { sku: 120, name: 130, qty: 45, mrp: 60, price: 65, value: 70 };
    const tableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
    const headerY = doc.y;

    doc.rect(pageLeft, headerY, tableWidth, 18).fill('#CC5620');
    let x = pageLeft;
    const headers: [string, number][] = [
      ['SKU Code', colWidths.sku],
      ['SKU Name', colWidths.name],
      ['Qty', colWidths.qty],
      ['MRP', colWidths.mrp],
      ['Unit Price', colWidths.price],
      ['Line Value', colWidths.value],
    ];
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    for (const [label, w] of headers) {
      doc.text(label, x + 4, headerY + 5, { width: w - 6 });
      x += w;
    }
    doc.y = headerY + 18;

    doc.font('Helvetica').fontSize(8).fillColor('#000');
    let alt = false;
    for (const li of lineItems) {
      // SKU names routinely wrap to two lines at this column width - a fixed
      // row height would let the wrapped second line bleed into the row
      // below it, so size each row from the actual wrapped text height.
      const nameHeight = doc.heightOfString(li.skuName, { width: colWidths.name - 6 });
      const rowH = Math.max(16, nameHeight + 8);

      if (doc.y + rowH > 780) {
        doc.addPage();
        doc.y = 40;
      }
      const rowY = doc.y;
      if (alt) doc.rect(pageLeft, rowY, tableWidth, rowH).fill('#FFF8EF');
      alt = !alt;
      doc.fillColor('#000');

      x = pageLeft;
      const cells: [string, number][] = [
        [li.skuCode, colWidths.sku],
        [li.skuName, colWidths.name],
        [String(Number(li.quantity)), colWidths.qty],
        [li.mrp != null ? money(li.mrp) : '-', colWidths.mrp],
        [li.unitPrice != null ? money(li.unitPrice) : '-', colWidths.price],
        [li.lineValue != null ? money(li.lineValue) : '-', colWidths.value],
      ];
      for (const [text, w] of cells) {
        doc.text(text, x + 4, rowY + 4, { width: w - 6 });
        x += w;
      }
      doc.y = rowY + rowH;
    }

    const totalQty = lineItems.reduce((s, li) => s + (Number(li.quantity) || 0), 0);
    const totalValue = lineItems.reduce((s, li) => s + (Number(li.lineValue) || 0), 0);
    doc.x = pageLeft;
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9).text(`Total Quantity: ${totalQty}     Total Value: ${money(totalValue)}`, pageLeft, doc.y);
  }
}
