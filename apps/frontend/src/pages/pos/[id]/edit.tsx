import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { poService } from '@/services/po.service';
import { documentsService } from '@/services/documents.service';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { POStatus, DocumentRecord } from '@po-control-tower/shared';
import { format } from 'date-fns';

const toInputDate = (v: any): string => (v ? format(new Date(v), 'yyyy-MM-dd') : '');
const toInputDateTime = (v: any): string => (v ? format(new Date(v), "yyyy-MM-dd'T'HH:mm") : '');
const emptyToNull = (v: string) => (v === '' ? null : v);
const numOrNull = (v: string) => (v === '' ? null : Number(v));

interface LineItemEdit {
  id: string;
  skuCode: string;
  skuName: string;
  quantity: string;
  availableQuantity: string;
  dispatchedQuantity: string;
  mrp: string;
  unitPrice: string;
  remarks: string;
}

export default function EditPO() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sensitiveFields, setSensitiveFields] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [initialPo, setInitialPo] = useState<any>(null);
  const [initialLineItems, setInitialLineItems] = useState<LineItemEdit[]>([]);

  const [po, setPo] = useState({
    poNumber: '', poDate: '', channelId: '', location: '', customerId: '', poExpiryDate: '', status: '', remarks: '',
  });
  const [lineItems, setLineItems] = useState<LineItemEdit[]>([]);
  const [appointment, setAppointment] = useState({
    requestedAt: '', confirmedAt: '', appointmentDate: '', appointmentWindow: '', appointmentId: '',
    appointmentTime: '', appointmentLocation: '', slaStatus: 'ON_TIME', extensionRequested: false,
    extensionGranted: false, extensionRequestedAt: '', extensionReason: '', remarks: '',
  });
  const [dispatch, setDispatch] = useState({
    plannedDispatchDate: '', actualDispatchDate: '', dispatchStatus: '', invoiceNumber: '', ewayBillNumber: '',
    vehicleNumber: '', lrNumber: '', docketNumber: '', transporterId: '', remarks: '',
  });
  const [logistics, setLogistics] = useState({
    transporterId: '', vehicleNumber: '', docketNumber: '', pickupDate: '', expectedDeliveryDate: '',
    actualDeliveryDate: '', lastTrackedStatus: '', delayReason: '', remarks: '',
  });
  const [grn, setGrn] = useState({
    grnNumber: '', grnDate: '', grnQuantity: '', acceptedQuantity: '', rejectedQuantity: '', shortQuantity: '',
    grnValue: '', outcome: '', remarks: '',
  });
  const [returnRecord, setReturnRecord] = useState({
    returnStatus: '', returnQuantity: '', lossAmount: '', rootCause: '', returnDate: '', remarks: '',
  });

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  const hasAppointment = !!initialPo?._hasAppointment;
  const hasDispatch = !!initialPo?._hasDispatch;
  const hasLogistics = !!initialPo?._hasLogistics;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(hasAppointment ? [{ key: 'appointment', label: 'Appointment' }] : []),
    ...(hasDispatch ? [{ key: 'dispatch', label: 'Dispatch' }] : []),
    ...(hasLogistics ? [{ key: 'logistics', label: 'Logistics' }] : []),
    { key: 'grn', label: 'Grn' },
    { key: 'returns', label: 'Returns' },
  ];

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [poData, itemsData, timelineData, sensitive, docs] = await Promise.all([
          poService.getPOById(id as string),
          poService.getLineItems(id as string),
          poService.getTimeline(id as string),
          poService.getSensitiveFields(),
          documentsService.listByPo(id as string),
        ]);

        setSensitiveFields(sensitive.fields);
        setDocuments(docs);

        setInitialPo({ ...poData, _hasAppointment: !!timelineData.appointment, _hasDispatch: !!timelineData.dispatch, _hasLogistics: !!timelineData.logistics });
        setPo({
          poNumber: poData.poNumber,
          poDate: toInputDate(poData.poDate),
          channelId: poData.channelId,
          location: poData.location,
          customerId: poData.customerId,
          poExpiryDate: toInputDate(poData.poExpiryDate),
          status: poData.status,
          remarks: poData.remarks || '',
        });

        const liEdit: LineItemEdit[] = itemsData.map((li: any) => ({
          id: li.id,
          skuCode: li.skuCode || '',
          skuName: li.skuName || '',
          quantity: String(li.quantity ?? ''),
          availableQuantity: li.availableQuantity != null ? String(li.availableQuantity) : '',
          dispatchedQuantity: li.dispatchedQuantity != null ? String(li.dispatchedQuantity) : '',
          mrp: li.mrp != null ? String(li.mrp) : '',
          unitPrice: li.unitPrice != null ? String(li.unitPrice) : '',
          remarks: li.remarks || '',
        }));
        setLineItems(liEdit);
        setInitialLineItems(liEdit);

        if (timelineData.appointment) {
          const a = timelineData.appointment;
          setAppointment({
            requestedAt: toInputDateTime(a.requestedAt),
            confirmedAt: toInputDateTime(a.confirmedAt),
            appointmentDate: toInputDate(a.appointmentDate),
            appointmentWindow: a.appointmentWindow || '',
            appointmentId: a.appointmentId || '',
            appointmentTime: a.appointmentTime || '',
            appointmentLocation: a.appointmentLocation || '',
            slaStatus: a.slaStatus || 'ON_TIME',
            extensionRequested: !!a.extensionRequested,
            extensionGranted: !!a.extensionGranted,
            extensionRequestedAt: toInputDateTime(a.extensionRequestedAt),
            extensionReason: a.extensionReason || '',
            remarks: a.remarks || '',
          });
        }

        if (timelineData.dispatch) {
          const d = timelineData.dispatch;
          setDispatch({
            plannedDispatchDate: toInputDateTime(d.plannedDispatchDate),
            actualDispatchDate: toInputDateTime(d.actualDispatchDate),
            dispatchStatus: d.dispatchStatus || '',
            invoiceNumber: d.invoiceNumber || '',
            ewayBillNumber: d.ewayBillNumber || '',
            vehicleNumber: d.vehicleNumber || '',
            lrNumber: d.lrNumber || '',
            docketNumber: d.docketNumber || '',
            transporterId: d.transporterId || '',
            remarks: d.remarks || '',
          });
        }

        if (timelineData.logistics) {
          const l = timelineData.logistics;
          setLogistics({
            transporterId: l.transporterId || '',
            vehicleNumber: l.vehicleNumber || '',
            docketNumber: l.docketNumber || '',
            pickupDate: toInputDateTime(l.pickupDate),
            expectedDeliveryDate: toInputDateTime(l.expectedDeliveryDate),
            actualDeliveryDate: toInputDateTime(l.actualDeliveryDate),
            lastTrackedStatus: l.lastTrackedStatus || '',
            delayReason: l.delayReason || '',
            remarks: l.remarks || '',
          });
        }

        if (timelineData.grn) {
          const g = timelineData.grn;
          setGrn({
            grnNumber: g.grnNumber || '',
            grnDate: toInputDateTime(g.grnDate),
            grnQuantity: g.grnQuantity != null ? String(g.grnQuantity) : '',
            acceptedQuantity: g.acceptedQuantity != null ? String(g.acceptedQuantity) : '',
            rejectedQuantity: g.rejectedQuantity != null ? String(g.rejectedQuantity) : '',
            shortQuantity: g.shortQuantity != null ? String(g.shortQuantity) : '',
            grnValue: g.grnValue != null ? String(g.grnValue) : '',
            outcome: g.outcome || '',
            remarks: g.remarks || '',
          });
        }

        if (timelineData.returnRecord) {
          const r = timelineData.returnRecord;
          setReturnRecord({
            returnStatus: r.returnStatus || '',
            returnQuantity: r.returnQuantity != null ? String(r.returnQuantity) : '',
            lossAmount: r.lossAmount != null ? String(r.lossAmount) : '',
            rootCause: r.rootCause || '',
            returnDate: toInputDateTime(r.returnDate),
            remarks: r.remarks || '',
          });
        }
      } catch (err) {
        console.error('Failed to load PO for edit', err);
        setError('Failed to load PO');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const updateLineItem = (index: number, field: keyof LineItemEdit, value: string) => {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, [field]: value } : li)));
  };

  const isSensitiveChange = (): boolean => {
    if (!initialPo) return false;
    if (po.poNumber !== initialPo.poNumber) return true;
    if (po.poDate !== toInputDate(initialPo.poDate)) return true;
    if (po.channelId !== initialPo.channelId) return true;
    if (po.location !== initialPo.location) return true;
    for (let i = 0; i < lineItems.length; i++) {
      if (Number(lineItems[i].quantity) !== Number(initialLineItems[i]?.quantity)) return true;
    }
    return false;
  };

  const buildPayload = () => {
    const payload: any = {};

    if (initialPo) {
      const poChanges: any = {};
      if (po.poNumber !== initialPo.poNumber) poChanges.poNumber = po.poNumber;
      if (po.poDate !== toInputDate(initialPo.poDate)) poChanges.poDate = po.poDate;
      if (po.channelId !== initialPo.channelId) poChanges.channelId = po.channelId;
      if (po.location !== initialPo.location) poChanges.location = po.location;
      if (po.customerId !== initialPo.customerId) poChanges.customerId = po.customerId;
      if (po.poExpiryDate !== toInputDate(initialPo.poExpiryDate)) poChanges.poExpiryDate = po.poExpiryDate;
      if (po.status !== initialPo.status) poChanges.status = po.status;
      if (po.remarks !== (initialPo.remarks || '')) poChanges.remarks = emptyToNull(po.remarks);
      if (Object.keys(poChanges).length > 0) payload.po = poChanges;
    }

    const lineItemChanges = lineItems
      .map((li, i) => {
        const init = initialLineItems[i];
        if (!init) return null;
        const changes: any = {};
        if (li.skuCode !== init.skuCode) changes.skuCode = li.skuCode;
        if (li.skuName !== init.skuName) changes.skuName = li.skuName;
        if (Number(li.quantity) !== Number(init.quantity)) changes.quantity = numOrNull(li.quantity);
        if (Number(li.availableQuantity || 0) !== Number(init.availableQuantity || 0)) changes.availableQuantity = numOrNull(li.availableQuantity);
        if (Number(li.dispatchedQuantity || 0) !== Number(init.dispatchedQuantity || 0)) changes.dispatchedQuantity = numOrNull(li.dispatchedQuantity);
        if (Number(li.mrp || 0) !== Number(init.mrp || 0)) changes.mrp = numOrNull(li.mrp);
        if (Number(li.unitPrice || 0) !== Number(init.unitPrice || 0)) changes.unitPrice = numOrNull(li.unitPrice);
        if (li.remarks !== init.remarks) changes.remarks = emptyToNull(li.remarks);
        return Object.keys(changes).length > 0 ? { id: li.id, ...changes } : null;
      })
      .filter(Boolean);
    if (lineItemChanges.length > 0) payload.lineItems = lineItemChanges;

    if (hasAppointment) {
      payload.appointment = {
        requestedAt: emptyToNull(appointment.requestedAt),
        confirmedAt: emptyToNull(appointment.confirmedAt),
        appointmentDate: emptyToNull(appointment.appointmentDate),
        appointmentWindow: emptyToNull(appointment.appointmentWindow),
        appointmentId: emptyToNull(appointment.appointmentId),
        appointmentTime: emptyToNull(appointment.appointmentTime),
        appointmentLocation: emptyToNull(appointment.appointmentLocation),
        slaStatus: appointment.slaStatus,
        extensionRequested: appointment.extensionRequested,
        extensionGranted: appointment.extensionGranted,
        extensionRequestedAt: emptyToNull(appointment.extensionRequestedAt),
        extensionReason: emptyToNull(appointment.extensionReason),
        remarks: emptyToNull(appointment.remarks),
      };
    }

    if (hasDispatch) {
      payload.dispatch = {
        plannedDispatchDate: emptyToNull(dispatch.plannedDispatchDate),
        actualDispatchDate: emptyToNull(dispatch.actualDispatchDate),
        dispatchStatus: emptyToNull(dispatch.dispatchStatus),
        invoiceNumber: emptyToNull(dispatch.invoiceNumber),
        ewayBillNumber: emptyToNull(dispatch.ewayBillNumber),
        vehicleNumber: emptyToNull(dispatch.vehicleNumber),
        lrNumber: emptyToNull(dispatch.lrNumber),
        docketNumber: emptyToNull(dispatch.docketNumber),
        transporterId: emptyToNull(dispatch.transporterId),
        remarks: emptyToNull(dispatch.remarks),
      };
    }

    if (hasLogistics) {
      payload.logistics = {
        transporterId: emptyToNull(logistics.transporterId),
        vehicleNumber: emptyToNull(logistics.vehicleNumber),
        docketNumber: emptyToNull(logistics.docketNumber),
        pickupDate: emptyToNull(logistics.pickupDate),
        expectedDeliveryDate: emptyToNull(logistics.expectedDeliveryDate),
        actualDeliveryDate: emptyToNull(logistics.actualDeliveryDate),
        lastTrackedStatus: emptyToNull(logistics.lastTrackedStatus),
        delayReason: emptyToNull(logistics.delayReason),
        remarks: emptyToNull(logistics.remarks),
      };
    }

    // GRN and Returns are upserted server-side even if no record exists yet,
    // but only send them if the user actually touched a field to avoid
    // creating empty tracker rows on every save.
    const grnTouched = Object.values(grn).some((v) => v !== '');
    if (grnTouched) {
      payload.grn = {
        grnNumber: emptyToNull(grn.grnNumber),
        grnDate: emptyToNull(grn.grnDate),
        grnQuantity: numOrNull(grn.grnQuantity),
        acceptedQuantity: numOrNull(grn.acceptedQuantity),
        rejectedQuantity: numOrNull(grn.rejectedQuantity),
        shortQuantity: numOrNull(grn.shortQuantity),
        grnValue: numOrNull(grn.grnValue),
        outcome: emptyToNull(grn.outcome),
        remarks: emptyToNull(grn.remarks),
      };
    }

    const returnTouched = Object.values(returnRecord).some((v) => v !== '');
    if (returnTouched) {
      payload.returnRecord = {
        returnStatus: emptyToNull(returnRecord.returnStatus),
        returnQuantity: numOrNull(returnRecord.returnQuantity),
        lossAmount: numOrNull(returnRecord.lossAmount),
        rootCause: emptyToNull(returnRecord.rootCause),
        returnDate: emptyToNull(returnRecord.returnDate),
        remarks: emptyToNull(returnRecord.remarks),
      };
    }

    return payload;
  };

  const doSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      await poService.editPO(id as string, payload);
      router.push(`/pos/${id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const handleSaveClick = () => {
    if (isSensitiveChange()) {
      setConfirmOpen(true);
    } else {
      doSave();
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading PO for editing...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Edit PO {po.poNumber}</h2>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/pos/${id}`)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">{error}</div>}

      {/* PO Details */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">PO Details</h3>
        <div className="grid grid-cols-3 gap-4">
          <TextField label="PO Number" value={po.poNumber} onChange={(v) => setPo({ ...po, poNumber: v })} />
          <DateField label="PO Date" value={po.poDate} onChange={(v) => setPo({ ...po, poDate: v })} />
          <TextField label="Platform / Source" value={po.channelId} onChange={(v) => setPo({ ...po, channelId: v })} />
          <TextField label="Location" value={po.location} onChange={(v) => setPo({ ...po, location: v })} />
          <TextField label="Warehouse / Customer" value={po.customerId} onChange={(v) => setPo({ ...po, customerId: v })} />
          <DateField label="Expiry Date" value={po.poExpiryDate} onChange={(v) => setPo({ ...po, poExpiryDate: v })} />
          <SelectField label="PO Status" value={po.status} onChange={(v) => setPo({ ...po, status: v })} options={Object.values(POStatus)} />
        </div>
        <TextAreaField label="Remarks" value={po.remarks} onChange={(v) => setPo({ ...po, remarks: v })} />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-4 font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-nootie-orange-dark border-b-2 border-nootie-orange'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
        {activeTab === 'overview' && (
          <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left">SKU Code</th>
                  <th className="px-2 py-2 text-left">SKU Name</th>
                  <th className="px-2 py-2 text-right">Ordered Qty</th>
                  <th className="px-2 py-2 text-right">Available Qty</th>
                  <th className="px-2 py-2 text-right">Dispatch Qty</th>
                  <th className="px-2 py-2 text-right">MRP</th>
                  <th className="px-2 py-2 text-right">Unit Price</th>
                  <th className="px-2 py-2 text-right">Line Value</th>
                  <th className="px-2 py-2 text-right">Fulfilment %</th>
                  <th className="px-2 py-2 text-left">Availability</th>
                  <th className="px-2 py-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lineItems.map((li, i) => {
                  const qty = Number(li.quantity) || 0;
                  const dispatched = Number(li.dispatchedQuantity) || 0;
                  const available = Number(li.availableQuantity) || 0;
                  const price = Number(li.unitPrice || li.mrp) || 0;
                  const lineValue = qty * price;
                  const fulfilmentPercent = qty > 0 ? Math.min((dispatched / qty) * 100, 100) : 0;
                  const availability = qty > 0 && available >= qty ? 'AVAILABLE' : available > 0 ? 'SHORT' : 'NOT_AVAILABLE';
                  return (
                    <tr key={li.id}>
                      <td className="px-2 py-2">
                        <input type="text" value={li.skuCode} onChange={(e) => updateLineItem(i, 'skuCode', e.target.value)} className="w-28 px-2 py-1 border border-gray-300 rounded text-sm" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="text" value={li.skuName} onChange={(e) => updateLineItem(i, 'skuName', e.target.value)} className="w-48 px-2 py-1 border border-gray-300 rounded text-sm" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" value={li.quantity} onChange={(e) => updateLineItem(i, 'quantity', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" value={li.availableQuantity} onChange={(e) => updateLineItem(i, 'availableQuantity', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" value={li.dispatchedQuantity} onChange={(e) => updateLineItem(i, 'dispatchedQuantity', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" value={li.mrp} onChange={(e) => updateLineItem(i, 'mrp', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" value={li.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      </td>
                      {/* Auto-calculated on save - shown here as a live preview, never directly editable */}
                      <td className="px-2 py-2 text-right text-gray-500">₹{lineValue.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-gray-500">{fulfilmentPercent.toFixed(1)}%</td>
                      <td className="px-2 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            availability === 'AVAILABLE'
                              ? 'bg-green-100 text-green-800'
                              : availability === 'SHORT'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {availability}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <input type="text" value={li.remarks} onChange={(e) => updateLineItem(i, 'remarks', e.target.value)} className="w-32 px-2 py-1 border border-gray-300 rounded text-sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Line Value, Fulfilment %, and Availability are auto-calculated on save (shown here as a live preview) - Total ordered/available/dispatch quantity, PO value, and stock/dispatch value are recalculated at the PO level too.
          </p>
          </div>
        )}

        {activeTab === 'appointment' && hasAppointment && (
          <div>
            <div className="grid grid-cols-3 gap-4">
              <DateTimeField label="Requested At" value={appointment.requestedAt} onChange={(v) => setAppointment({ ...appointment, requestedAt: v })} />
              <SelectField label="Request Status" value={appointment.slaStatus} onChange={(v) => setAppointment({ ...appointment, slaStatus: v })} options={['ON_TIME', 'ESCALATED', 'BREACHED']} />
              <DateTimeField label="Confirmed At" value={appointment.confirmedAt} onChange={(v) => setAppointment({ ...appointment, confirmedAt: v })} />
              <DateField label="Appointment Date" value={appointment.appointmentDate} onChange={(v) => setAppointment({ ...appointment, appointmentDate: v })} />
              <TextField label="Appointment Time" value={appointment.appointmentTime} onChange={(v) => setAppointment({ ...appointment, appointmentTime: v })} />
              <TextField label="Appointment ID" value={appointment.appointmentId} onChange={(v) => setAppointment({ ...appointment, appointmentId: v })} />
              <TextField label="Appointment Location" value={appointment.appointmentLocation} onChange={(v) => setAppointment({ ...appointment, appointmentLocation: v })} />
              <CheckboxField label="Extension Requested" checked={appointment.extensionRequested} onChange={(v) => setAppointment({ ...appointment, extensionRequested: v })} />
              <CheckboxField label="Extension Granted" checked={appointment.extensionGranted} onChange={(v) => setAppointment({ ...appointment, extensionGranted: v })} />
              <DateTimeField label="Extension Requested At" value={appointment.extensionRequestedAt} onChange={(v) => setAppointment({ ...appointment, extensionRequestedAt: v })} />
              <TextField label="Extension Reason" value={appointment.extensionReason} onChange={(v) => setAppointment({ ...appointment, extensionReason: v })} />
            </div>
            <TextAreaField label="Appointment Remarks" value={appointment.remarks} onChange={(v) => setAppointment({ ...appointment, remarks: v })} />
            <DocumentPanel poId={id as string} documentType="QR_CODE" label="QR Image / PDF" documents={documents} onChanged={setDocuments} />
          </div>
        )}

        {activeTab === 'dispatch' && hasDispatch && (
          <div>
            <div className="grid grid-cols-3 gap-4">
              <DateTimeField label="Planned Dispatch Date" value={dispatch.plannedDispatchDate} onChange={(v) => setDispatch({ ...dispatch, plannedDispatchDate: v })} />
              <DateTimeField label="Actual Dispatch Date" value={dispatch.actualDispatchDate} onChange={(v) => setDispatch({ ...dispatch, actualDispatchDate: v })} />
              <TextField label="Dispatch Status" value={dispatch.dispatchStatus} onChange={(v) => setDispatch({ ...dispatch, dispatchStatus: v })} />
              <TextField label="Invoice Number" value={dispatch.invoiceNumber} onChange={(v) => setDispatch({ ...dispatch, invoiceNumber: v })} />
              <TextField label="E-way Bill" value={dispatch.ewayBillNumber} onChange={(v) => setDispatch({ ...dispatch, ewayBillNumber: v })} />
              <TextField label="Vehicle Number" value={dispatch.vehicleNumber} onChange={(v) => setDispatch({ ...dispatch, vehicleNumber: v })} />
              <TextField label="LR Number" value={dispatch.lrNumber} onChange={(v) => setDispatch({ ...dispatch, lrNumber: v })} />
              <TextField label="Docket Number" value={dispatch.docketNumber} onChange={(v) => setDispatch({ ...dispatch, docketNumber: v })} />
              <TextField label="Transporter" value={dispatch.transporterId} onChange={(v) => setDispatch({ ...dispatch, transporterId: v })} />
            </div>
            <TextAreaField label="Dispatch Remarks" value={dispatch.remarks} onChange={(v) => setDispatch({ ...dispatch, remarks: v })} />
            <DocumentPanel poId={id as string} documentType="DISPATCH_DOCUMENT" label="Dispatch Documents" documents={documents} onChanged={setDocuments} />
          </div>
        )}

        {activeTab === 'logistics' && hasLogistics && (
          <div>
            <div className="grid grid-cols-3 gap-4">
              <TextField label="Transporter" value={logistics.transporterId} onChange={(v) => setLogistics({ ...logistics, transporterId: v })} />
              <TextField label="Vehicle Number" value={logistics.vehicleNumber} onChange={(v) => setLogistics({ ...logistics, vehicleNumber: v })} />
              <TextField label="LR / Docket Number" value={logistics.docketNumber} onChange={(v) => setLogistics({ ...logistics, docketNumber: v })} />
              <DateTimeField label="Pickup Date" value={logistics.pickupDate} onChange={(v) => setLogistics({ ...logistics, pickupDate: v })} />
              <DateTimeField label="Expected Delivery" value={logistics.expectedDeliveryDate} onChange={(v) => setLogistics({ ...logistics, expectedDeliveryDate: v })} />
              <DateTimeField label="Actual Delivery" value={logistics.actualDeliveryDate} onChange={(v) => setLogistics({ ...logistics, actualDeliveryDate: v })} />
              <TextField label="Logistics Status" value={logistics.lastTrackedStatus} onChange={(v) => setLogistics({ ...logistics, lastTrackedStatus: v })} />
              <TextField label="Delay Reason" value={logistics.delayReason} onChange={(v) => setLogistics({ ...logistics, delayReason: v })} />
            </div>
            <TextAreaField label="Logistics Remarks" value={logistics.remarks} onChange={(v) => setLogistics({ ...logistics, remarks: v })} />
            <DocumentPanel poId={id as string} documentType="POD" label="POD" documents={documents} onChanged={setDocuments} />
          </div>
        )}

        {activeTab === 'grn' && (
          <div>
            <div className="grid grid-cols-3 gap-4">
              <TextField label="GRN Number" value={grn.grnNumber} onChange={(v) => setGrn({ ...grn, grnNumber: v })} />
              <DateTimeField label="GRN Date" value={grn.grnDate} onChange={(v) => setGrn({ ...grn, grnDate: v })} />
              <NumberField label="GRN Quantity" value={grn.grnQuantity} onChange={(v) => setGrn({ ...grn, grnQuantity: v })} />
              <NumberField label="Accepted Quantity" value={grn.acceptedQuantity} onChange={(v) => setGrn({ ...grn, acceptedQuantity: v })} />
              <NumberField label="Rejected Quantity" value={grn.rejectedQuantity} onChange={(v) => setGrn({ ...grn, rejectedQuantity: v })} />
              <NumberField label="Short Quantity" value={grn.shortQuantity} onChange={(v) => setGrn({ ...grn, shortQuantity: v })} />
              <NumberField label="GRN Value" value={grn.grnValue} onChange={(v) => setGrn({ ...grn, grnValue: v })} />
              <SelectField label="GRN Status / Outcome" value={grn.outcome} onChange={(v) => setGrn({ ...grn, outcome: v })} options={['', 'MATCHED', 'MISMATCHED', 'SHORTAGE', 'DAMAGE', 'OTHER', 'NO_GRN']} />
            </div>
            <TextAreaField label="GRN Remarks" value={grn.remarks} onChange={(v) => setGrn({ ...grn, remarks: v })} />
            <DocumentPanel poId={id as string} documentType="GRN" label="GRN Document" documents={documents} onChanged={setDocuments} />
          </div>
        )}

        {activeTab === 'returns' && (
          <div>
            <div className="grid grid-cols-3 gap-4">
              <TextField label="Return Status" value={returnRecord.returnStatus} onChange={(v) => setReturnRecord({ ...returnRecord, returnStatus: v })} />
              <NumberField label="Return Quantity" value={returnRecord.returnQuantity} onChange={(v) => setReturnRecord({ ...returnRecord, returnQuantity: v })} />
              <NumberField label="Return Value" value={returnRecord.lossAmount} onChange={(v) => setReturnRecord({ ...returnRecord, lossAmount: v })} />
              <TextField label="Reason" value={returnRecord.rootCause} onChange={(v) => setReturnRecord({ ...returnRecord, rootCause: v })} />
              <DateTimeField label="Return Date" value={returnRecord.returnDate} onChange={(v) => setReturnRecord({ ...returnRecord, returnDate: v })} />
            </div>
            <TextAreaField label="Return Remarks" value={returnRecord.remarks} onChange={(v) => setReturnRecord({ ...returnRecord, remarks: v })} />
            <DocumentPanel poId={id as string} documentType="RETURN_DOCUMENT" label="Return Document" documents={documents} onChanged={setDocuments} />
          </div>
        )}
        </div>
      </div>

      <div className="flex gap-4 justify-end mt-6">
        <button
          onClick={() => router.push(`/pos/${id}`)}
          className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveClick}
          disabled={saving}
          className="px-6 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <p className="font-medium text-gray-800 mb-4">
              ⚠️ You are changing core PO information. This change will be recorded in the audit history.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">
                Cancel
              </button>
              <button onClick={doSave} disabled={saving} className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white rounded-lg disabled:opacity-50">
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

const TextField: React.FC<{ label: string; value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
    />
  </div>
);

const NumberField: React.FC<{ label: string; value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input
      type="number"
      step="0.01"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
    />
  </div>
);

const DateField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
  </div>
);

const DateTimeField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
  </div>
);

const SelectField: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: string[] }> = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt || '-'}
        </option>
      ))}
    </select>
  </div>
);

const TextAreaField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div className="mt-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
  </div>
);

const CheckboxField: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center gap-2 mt-6">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    <label className="text-sm font-medium text-gray-700">{label}</label>
  </div>
);

const DocumentPanel: React.FC<{
  poId: string;
  documentType: string;
  label: string;
  documents: DocumentRecord[];
  onChanged: (docs: DocumentRecord[]) => void;
}> = ({ poId, documentType, label, documents, onChanged }) => {
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const relevant = documents.filter((d) => d.documentType === documentType);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !poId) return;
    setUploading(true);
    try {
      const doc = await documentsService.upload(poId, documentType, file);
      onChanged([doc, ...documents]);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    await documentsService.delete(docId);
    onChanged(documents.filter((d) => d.id !== docId));
  };

  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="space-y-2 mb-2">
        {relevant.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
            <button
              onClick={() => setPreviewDoc(doc)}
              className="text-nootie-orange-dark hover:underline"
            >
              {doc.fileName}
            </button>
            <button onClick={() => handleDelete(doc.id)} className="text-red-500 hover:text-red-700 text-xs">
              Remove
            </button>
          </div>
        ))}
        {relevant.length === 0 && <p className="text-xs text-gray-400">No file uploaded.</p>}
      </div>
      <input type="file" onChange={handleUpload} disabled={uploading} className="text-xs" />
      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
};
