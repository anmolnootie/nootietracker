import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { MainLayout } from '@/components/Layout';
import { RiskBadge, StatusBadge } from '@/components/Badges';
import { poService } from '@/services/po.service';
import { poMappingService, MappedStockForNewPo, POMappingRow } from '@/services/po-mapping.service';
import { documentsService } from '@/services/documents.service';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import {
  POMaster,
  POLineItem,
  DocumentRecord,
  NonFulfilmentReason,
  NON_FULFILMENT_REASON_LABELS,
} from '@po-control-tower/shared';
import { format } from 'date-fns';

export default function PODetail() {
  const router = useRouter();
  const { id } = router.query;
  const [po, setPO] = useState<POMaster | null>(null);
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [timeline, setTimeline] = useState<any>(null);
  const [changeHistory, setChangeHistory] = useState<any[]>([]);
  const [source, setSource] = useState<any>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [mappedStock, setMappedStock] = useState<MappedStockForNewPo | null>(null);
  const [reattemptMapping, setReattemptMapping] = useState<POMappingRow | null>(null);
  const [reattemptBusy, setReattemptBusy] = useState(false);
  const [reattemptError, setReattemptError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [nfModalOpen, setNfModalOpen] = useState(false);
  const [nfReason, setNfReason] = useState<NonFulfilmentReason | ''>('');
  const [nfRemarks, setNfRemarks] = useState('');
  const [nfError, setNfError] = useState('');
  const [nfDiagnosis, setNfDiagnosis] = useState('');
  const [nfDiagnosisLoading, setNfDiagnosisLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchPO = async () => {
    if (!id) return;
    try {
      const [poData, itemsData, timelineData, historyData, sourceData, documentsData] = await Promise.all([
        poService.getPOById(id as string),
        poService.getLineItems(id as string),
        poService.getTimeline(id as string),
        poService.getChangeHistory(id as string),
        poService.getSource(id as string),
        documentsService.listByPo(id as string),
      ]);
      setPO(poData);
      setLineItems(itemsData);
      setTimeline(timelineData);
      setChangeHistory(historyData);
      setSource(sourceData);
      setDocuments(documentsData);
      poMappingService.getMappedStockForNewPo(id as string).then(setMappedStock).catch(() => {});
      poMappingService
        .list({ originalPoId: id as string, status: 'ACTIVE' })
        .then((mappings) => setReattemptMapping(mappings.find((m) => m.reason === 'REATTEMPT') || null))
        .catch(() => {});
    } catch (error) {
      console.error('Failed to fetch PO', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPO();
  }, [id]);

  const handleDownloadPdf = async () => {
    if (!po) return;
    setDownloadingPdf(true);
    setActionError('');
    try {
      await poService.downloadPdf(po.id, po.poNumber);
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!po) return;
    setActionLoading(true);
    setActionError('');
    try {
      await poService.softDeletePO(po.id);
      router.push('/pos');
    } catch (err: any) {
      // The only 400 this endpoint returns is "already in the Bin" (e.g. a
      // stale page re-submitting a prior successful delete) - the desired
      // end state is already true there, so just leave instead of showing
      // an error for something that already worked.
      if (err.response?.status === 400) {
        router.push('/pos');
        return;
      }
      setActionError(err.response?.data?.message || 'Failed to move PO to Bin');
      setActionLoading(false);
    }
  };

  const openNotFulfilledModal = async () => {
    if (!po) return;
    setNfModalOpen(true);
    setNfDiagnosisLoading(true);
    try {
      const { diagnosis } = await poService.getNonFulfilmentDiagnosis(po.id);
      setNfDiagnosis(diagnosis);
    } catch {
      setNfDiagnosis('');
    } finally {
      setNfDiagnosisLoading(false);
    }
  };

  const handleMarkNotFulfilled = async () => {
    if (!po) return;
    setNfError('');
    if (!nfReason) {
      setNfError('Please select a reason.');
      return;
    }
    if (nfReason === NonFulfilmentReason.OTHER && !nfRemarks.trim()) {
      setNfError('Remarks are required when reason is "Other".');
      return;
    }
    setActionLoading(true);
    try {
      await poService.markNotFulfilled(po.id, nfReason, nfRemarks || undefined);
      setNfModalOpen(false);
      setNfReason('');
      setNfRemarks('');
      setNfDiagnosis('');
      fetchPO();
    } catch (err: any) {
      setNfError(err.response?.data?.message || 'Failed to save');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkFulfilled = async () => {
    if (!po) return;
    setActionLoading(true);
    setActionError('');
    try {
      await poService.markFulfilled(po.id);
      fetchPO();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to mark PO as fulfilled');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReattempt = async () => {
    if (!po) return;
    setReattemptBusy(true);
    setReattemptError('');
    try {
      const result = await poService.reattemptDelivery(po.id);
      router.push(`/pos/${result.newPo.id}`);
    } catch (err: any) {
      setReattemptError(err.response?.data?.message || 'Failed to create reattempt delivery');
    } finally {
      setReattemptBusy(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Loading PO details...</p>
        </div>
      </MainLayout>
    );
  }

  if (!po) {
    return (
      <MainLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
          PO not found
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {/* PO Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{po.poNumber}</h2>
            <p className="text-gray-500 text-sm mt-1">ID: {po.id}</p>
          </div>
          <div className="text-right">
            <div className="flex gap-2 mb-3 justify-end">
              <button
                onClick={() => router.push(`/pos/${po.id}/edit`)}
                className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg text-sm"
              >
                Edit PO
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-sm disabled:opacity-50"
              >
                {downloadingPdf ? 'Downloading...' : '⇩ Download PDF'}
              </button>
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg text-sm"
              >
                Delete PO
              </button>
            </div>
            <div className="mb-2">
              <RiskBadge risk={po.riskStatus} size="lg" />
            </div>
            <p className="text-sm text-gray-600">Priority: {Number(po.priorityScore).toFixed(1)}/100</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <InfoBox label="PO Date" value={format(new Date(po.poDate), 'dd MMM yyyy')} />
          <InfoBox label="Expiry Date" value={format(new Date(po.poExpiryDate), 'dd MMM yyyy')} />
          <InfoBox label="PO Value" value={`₹${Number(po.poValue).toLocaleString()}`} />
          <InfoBox label="Status" value={<StatusBadge status={po.status} />} />
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <InfoBox label="Channel" value={po.channelId} />
          <InfoBox label="Customer" value={po.customerId} />
          <InfoBox label="Location" value={po.location} />
          <InfoBox label="Overall Owner" value={po.overallOwnerId} />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <InfoBox label="Fulfilment %" value={po.fulfilmentPercent != null ? `${Number(po.fulfilmentPercent).toFixed(1)}%` : '-'} />
          <InfoBox label="Fill Rate %" value={po.fillRatePercent != null ? `${Number(po.fillRatePercent).toFixed(1)}%` : '-'} />
          <InfoBox label="Available Stock Value" value={po.availableStockValue != null ? `₹${Number(po.availableStockValue).toLocaleString()}` : '-'} />
          <InfoBox label="Dispatch Value" value={po.dispatchValue != null ? `₹${Number(po.dispatchValue).toLocaleString()}` : '-'} />
          <InfoBox label="GRN Value" value={timeline?.grn?.grnValue != null ? `₹${Number(timeline.grn.grnValue).toLocaleString()}` : '-'} />
          <InfoBox
            label="Low PO Value"
            value={
              po.isLowPoValue ? (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">LOW VALUE</span>
              ) : (
                'No'
              )
            }
          />
        </div>

        <div className="mt-4 p-4 rounded-lg border flex items-center justify-between bg-gray-50">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Fulfilment Decision</p>
            {po.fulfilmentDecision === 'NOT_FULFILLED' ? (
              <div>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">NOT FULFILLED</span>
                <span className="ml-2 text-sm text-gray-700">
                  Reason: {po.nonFulfilmentReason ? NON_FULFILMENT_REASON_LABELS[po.nonFulfilmentReason] : '-'}
                </span>
                {po.nonFulfilmentRemarks && (
                  <p className="text-sm text-gray-700 mt-1">
                    <span className="text-xs text-gray-500 uppercase tracking-wide mr-1">Your Remarks:</span>
                    {po.nonFulfilmentRemarks}
                  </p>
                )}
                {po.nonFulfilmentSystemRemarks && (
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide mr-1">System Notes:</span>
                    {po.nonFulfilmentSystemRemarks}
                  </p>
                )}
              </div>
            ) : (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">FULFILLED</span>
            )}
          </div>
          {po.fulfilmentDecision === 'NOT_FULFILLED' ? (
            <button
              onClick={handleMarkFulfilled}
              disabled={actionLoading}
              className="px-4 py-2 bg-nootie-orange-dark hover:bg-nootie-orange text-white font-medium rounded-lg text-sm disabled:opacity-50"
            >
              Mark as Fulfilled
            </button>
          ) : (
            <button
              onClick={openNotFulfilledModal}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg text-sm"
            >
              Mark as Not Fulfilled
            </button>
          )}
        </div>

        {po.remarks && (
          <div className="mt-4 p-3 bg-gray-50 rounded border text-sm">
            <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Remarks</span>
            {po.remarks}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex">
            {['overview', 'appointment', 'dispatch', 'logistics', 'grn', 'returns', 'history', 'source', 'audit'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-nootie-orange-dark border-b-2 border-nootie-orange'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div>
              {mappedStock && mappedStock.totalQuantityMapped > 0 && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800">
                    📦 Mapped Stock Available: {mappedStock.totalQuantityMapped.toLocaleString()} units (₹{mappedStock.totalValueMapped.toLocaleString()})
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Already-stuck stock from another PO has been allocated here - no need for fresh stock for this quantity.{' '}
                    <a href="/po-mapping" className="underline">
                      View mapping →
                    </a>
                  </p>
                </div>
              )}
              <h3 className="text-lg font-semibold mb-4">Line Items</h3>
              {lineItems.length === 0 ? (
                <p className="text-gray-500">No line items</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">SKU Code</th>
                        <th className="px-4 py-2 text-left">SKU Name</th>
                        <th className="px-4 py-2 text-right">Ordered Qty</th>
                        <th className="px-4 py-2 text-right">Available Qty</th>
                        <th className="px-4 py-2 text-right">Dispatch Qty</th>
                        <th className="px-4 py-2 text-right">MRP</th>
                        <th className="px-4 py-2 text-right">Unit Price</th>
                        <th className="px-4 py-2 text-right">Line Value</th>
                        <th className="px-4 py-2 text-right">Fulfilment %</th>
                        <th className="px-4 py-2 text-left">Availability</th>
                        <th className="px-4 py-2 text-left">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lineItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-medium">{item.skuCode}</td>
                          <td className="px-4 py-3">{item.skuName}</td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">{item.availableQuantity ?? '-'}</td>
                          <td className="px-4 py-3 text-right">{item.dispatchedQuantity ?? '-'}</td>
                          <td className="px-4 py-3 text-right">{item.mrp != null ? `₹${Number(item.mrp).toLocaleString()}` : '-'}</td>
                          <td className="px-4 py-3 text-right">{item.unitPrice != null ? `₹${Number(item.unitPrice).toLocaleString()}` : '-'}</td>
                          <td className="px-4 py-3 text-right">{item.lineValue != null ? `₹${Number(item.lineValue).toLocaleString()}` : '-'}</td>
                          <td className="px-4 py-3 text-right">{item.fulfilmentPercent != null ? `${Number(item.fulfilmentPercent).toFixed(1)}%` : '-'}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                item.availability === 'AVAILABLE'
                                  ? 'bg-green-100 text-green-800'
                                  : item.availability === 'SHORT'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {item.availability}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{item.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'appointment' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Appointment Details</h3>
              {timeline?.appointment ? (
                <div className="grid grid-cols-2 gap-4">
                  <InfoBox label="Requested At" value={timeline.appointment.requestedAt ? format(new Date(timeline.appointment.requestedAt), 'dd MMM yyyy HH:mm') : 'Not requested'} />
                  <InfoBox label="Confirmed At" value={timeline.appointment.confirmedAt ? format(new Date(timeline.appointment.confirmedAt), 'dd MMM yyyy HH:mm') : 'Not confirmed'} />
                  <InfoBox label="Appointment Date" value={timeline.appointment.appointmentDate ? format(new Date(timeline.appointment.appointmentDate), 'dd MMM yyyy') : '-'} />
                  <InfoBox label="SLA Status" value={timeline.appointment.slaStatus} />
                  <InfoBox label="Extension Requested" value={timeline.appointment.extensionRequested ? 'Yes' : 'No'} />
                  <InfoBox label="Extension Granted" value={timeline.appointment.extensionGranted ? 'Yes' : 'No'} />
                  <InfoBox label="Appointment ID" value={timeline.appointment.appointmentId || '-'} />
                  <InfoBox label="Appointment Time" value={timeline.appointment.appointmentTime || '-'} />
                  <InfoBox label="Appointment Location" value={timeline.appointment.appointmentLocation || '-'} />
                  <InfoBox label="Extension Reason" value={timeline.appointment.extensionReason || '-'} />
                  <InfoBox label="Appointment Window" value={timeline.appointment.appointmentWindow || '-'} />
                  <InfoBox label="Extension Requested At" value={timeline.appointment.extensionRequestedAt ? format(new Date(timeline.appointment.extensionRequestedAt), 'dd MMM yyyy HH:mm') : '-'} />
                </div>
              ) : (
                <p className="text-gray-500">No appointment record.</p>
              )}
              {timeline?.appointment?.remarks && (
                <div className="mt-4 p-3 bg-gray-50 rounded border text-sm">
                  <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Remarks</span>
                  {timeline.appointment.remarks}
                </div>
              )}
              <DocumentList label="QR Image / PDF" documents={documents} documentType="QR_CODE" />
            </div>
          )}

          {activeTab === 'dispatch' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Dispatch Details</h3>
              {timeline?.dispatch ? (
                <>
                  <div className="mb-4 p-4 bg-nootie-orange-light rounded-lg">
                    <p className="text-xs font-medium text-nootie-orange-dark uppercase tracking-wide mb-3">Dynamic Dispatch Plan</p>
                    <div className="grid grid-cols-3 gap-4">
                      <InfoBox label="Location Type" value={timeline.dispatch.locationType || '-'} />
                      <InfoBox label="TAT Rule" value={timeline.dispatch.tatRuleDescription || '-'} />
                      <InfoBox
                        label="Dispatch Status"
                        value={
                          <DispatchStatusBadge status={timeline.dispatch.dispatchPlanStatus} />
                        }
                      />
                      <InfoBox
                        label="Dispatch Window"
                        value={
                          timeline.dispatch.dispatchWindowEarliest
                            ? `${format(new Date(timeline.dispatch.dispatchWindowEarliest), 'dd MMM')} → ${format(new Date(timeline.dispatch.dispatchWindowLatest), 'dd MMM yyyy')}`
                            : '-'
                        }
                      />
                      <InfoBox
                        label="Recommended Dispatch Date"
                        value={timeline.dispatch.recommendedDispatchDate ? format(new Date(timeline.dispatch.recommendedDispatchDate), 'dd MMM yyyy') : '-'}
                      />
                      <InfoBox
                        label="Actual vs Recommended"
                        value={
                          timeline.dispatch.dispatchVarianceLabel
                            ? `${timeline.dispatch.dispatchVarianceDays} day(s) ${timeline.dispatch.dispatchVarianceLabel.replace('_', ' ').toLowerCase()}`
                            : '-'
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <InfoBox label="Ideal Dispatch Date" value={format(new Date(timeline.dispatch.idealDispatchDate), 'dd MMM yyyy')} />
                    <InfoBox label="Latest Safe Dispatch Date" value={format(new Date(timeline.dispatch.latestSafeDispatchDate), 'dd MMM yyyy')} />
                    <InfoBox label="Actual Dispatch Date" value={timeline.dispatch.actualDispatchDate ? format(new Date(timeline.dispatch.actualDispatchDate), 'dd MMM yyyy') : 'Not dispatched'} />
                    <InfoBox label="Docket Number" value={timeline.dispatch.docketNumber || '-'} />
                    <InfoBox label="Transporter" value={timeline.dispatch.transporterId || '-'} />
                    <InfoBox label="Planned Dispatch Date" value={timeline.dispatch.plannedDispatchDate ? format(new Date(timeline.dispatch.plannedDispatchDate), 'dd MMM yyyy HH:mm') : '-'} />
                    <InfoBox label="Dispatch Status" value={timeline.dispatch.dispatchStatus || '-'} />
                    <InfoBox label="Invoice Number" value={timeline.dispatch.invoiceNumber || '-'} />
                    <InfoBox label="Invoice Value" value={timeline.dispatch.invoiceValue != null ? `₹${Number(timeline.dispatch.invoiceValue).toLocaleString()}` : '-'} />
                    <InfoBox label="Invoice Date" value={timeline.dispatch.invoiceDate ? format(new Date(timeline.dispatch.invoiceDate), 'dd MMM yyyy') : '-'} />
                    <InfoBox label="AWB Number" value={timeline.dispatch.awbNumber || '-'} />
                    <InfoBox label="E-way Bill" value={timeline.dispatch.ewayBillNumber || '-'} />
                    <InfoBox label="Vehicle Number" value={timeline.dispatch.vehicleNumber || '-'} />
                    <InfoBox label="LR Number" value={timeline.dispatch.lrNumber || '-'} />
                  </div>
                </>
              ) : (
                <p className="text-gray-500">No dispatch record.</p>
              )}
              {timeline?.dispatch?.remarks && (
                <div className="mt-4 p-3 bg-gray-50 rounded border text-sm">
                  <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Remarks</span>
                  {timeline.dispatch.remarks}
                </div>
              )}
              <DocumentList label="Dispatch Documents" documents={documents} documentType="DISPATCH_DOCUMENT" />
            </div>
          )}

          {activeTab === 'logistics' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Logistics Tracking</h3>
              {timeline?.logistics ? (
                <div className="grid grid-cols-2 gap-4">
                  <InfoBox label="Docket Number" value={timeline.logistics.docketNumber} />
                  <InfoBox label="Transporter" value={timeline.logistics.transporterId || '-'} />
                  <InfoBox label="Last Tracked Status" value={timeline.logistics.lastTrackedStatus || '-'} />
                  <InfoBox label="Last Update" value={timeline.logistics.lastUpdateTime ? format(new Date(timeline.logistics.lastUpdateTime), 'dd MMM yyyy HH:mm') : '-'} />
                  <InfoBox label="AVV Received & Actioned" value={timeline.logistics.receivedAndActioned ? 'Yes' : 'No'} />
                  <InfoBox label="Vehicle Number" value={timeline.logistics.vehicleNumber || '-'} />
                  <InfoBox label="Pickup Date" value={timeline.logistics.pickupDate ? format(new Date(timeline.logistics.pickupDate), 'dd MMM yyyy HH:mm') : '-'} />
                  <InfoBox label="Expected Delivery" value={timeline.logistics.expectedDeliveryDate ? format(new Date(timeline.logistics.expectedDeliveryDate), 'dd MMM yyyy HH:mm') : '-'} />
                  <InfoBox label="Actual Delivery" value={timeline.logistics.actualDeliveryDate ? format(new Date(timeline.logistics.actualDeliveryDate), 'dd MMM yyyy HH:mm') : '-'} />
                  <InfoBox label="Delay Reason" value={timeline.logistics.delayReason || '-'} />
                </div>
              ) : (
                <p className="text-gray-500">Not dispatched yet.</p>
              )}
              {timeline?.logistics?.remarks && (
                <div className="mt-4 p-3 bg-gray-50 rounded border text-sm">
                  <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Remarks</span>
                  {timeline.logistics.remarks}
                </div>
              )}
              <DocumentList label="POD" documents={documents} documentType="POD" />
            </div>
          )}

          {activeTab === 'grn' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">GRN Details</h3>
              {timeline?.grn ? (
                <div className="grid grid-cols-2 gap-4">
                  <InfoBox label="GRN Number" value={timeline.grn.grnNumber || 'Not recorded'} />
                  <InfoBox label="GRN Date" value={timeline.grn.grnDate ? format(new Date(timeline.grn.grnDate), 'dd MMM yyyy HH:mm') : '-'} />
                  <InfoBox label="GRN Value" value={timeline.grn.grnValue != null ? `₹${Number(timeline.grn.grnValue).toLocaleString()}` : '-'} />
                  <InfoBox label="Outcome" value={timeline.grn.outcome || 'Pending'} />
                  <InfoBox label="Discrepancy Amount" value={timeline.grn.discrepancyAmount != null ? `₹${Number(timeline.grn.discrepancyAmount).toLocaleString()}` : '-'} />
                  <InfoBox label="Discrepancy Reason" value={timeline.grn.discrepancyReason || '-'} />
                  <InfoBox label="GRN Quantity" value={timeline.grn.grnQuantity ?? '-'} />
                  <InfoBox label="Accepted Quantity" value={timeline.grn.acceptedQuantity ?? '-'} />
                  <InfoBox label="Rejected Quantity" value={timeline.grn.rejectedQuantity ?? '-'} />
                  <InfoBox label="Short Quantity" value={timeline.grn.shortQuantity ?? '-'} />
                </div>
              ) : (
                <p className="text-gray-500">Not delivered yet - GRN not opened.</p>
              )}
              {timeline?.grn?.remarks && (
                <div className="mt-4 p-3 bg-gray-50 rounded border text-sm">
                  <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Remarks</span>
                  {timeline.grn.remarks}
                </div>
              )}
              <DocumentList label="GRN Document" documents={documents} documentType="GRN" />
            </div>
          )}

          {activeTab === 'returns' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Returns / Recall</h3>
              {timeline?.returnRecord ? (
                <div className="grid grid-cols-2 gap-4">
                  <InfoBox label="Return Type" value={timeline.returnRecord.returnType.replace(/_/g, ' ')} />
                  <InfoBox label="Return Date" value={timeline.returnRecord.returnDate ? format(new Date(timeline.returnRecord.returnDate), 'dd MMM yyyy HH:mm') : '-'} />
                  <InfoBox label="Root Cause" value={timeline.returnRecord.rootCause || 'Pending'} />
                  <InfoBox label="Credit Note" value={timeline.returnRecord.creditNoteNumber || '-'} />
                  <InfoBox label="Loss / Return Value" value={timeline.returnRecord.lossAmount != null ? `₹${Number(timeline.returnRecord.lossAmount).toLocaleString()}` : '-'} />
                  <InfoBox label="Return Status" value={timeline.returnRecord.returnStatus || '-'} />
                  <InfoBox label="Return Quantity" value={timeline.returnRecord.returnQuantity ?? '-'} />
                </div>
              ) : (
                <p className="text-gray-500">No return recorded for this PO.</p>
              )}
              {timeline?.returnRecord?.remarks && (
                <div className="mt-4 p-3 bg-gray-50 rounded border text-sm">
                  <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Remarks</span>
                  {timeline.returnRecord.remarks}
                </div>
              )}
              {timeline?.returnRecord?.returnType === 'RECALL_NOT_DELIVERED' && (
                <div className="mt-4">
                  {reattemptMapping ? (
                    <a
                      href={`/pos/${reattemptMapping.newPoId}`}
                      className="inline-block px-3 py-1.5 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm rounded-lg"
                    >
                      View Reattempt PO ({reattemptMapping.newPoNumber})
                    </a>
                  ) : (
                    <button
                      disabled={reattemptBusy}
                      onClick={handleReattempt}
                      className="px-3 py-1.5 bg-nootie-orange-dark hover:bg-nootie-orange text-white text-sm rounded-lg disabled:opacity-50"
                    >
                      {reattemptBusy ? 'Creating...' : 'Create Reattempt Delivery'}
                    </button>
                  )}
                  {reattemptError && <p className="text-xs text-red-600 mt-2">{reattemptError}</p>}
                </div>
              )}
              <DocumentList label="Return Document" documents={documents} documentType="RETURN_DOCUMENT" />
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">PO Change History</h3>
              {changeHistory.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {changeHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 py-2 border-b">
                      <span className="text-xs text-gray-400 w-40 shrink-0">{format(new Date(entry.changedAt), 'dd MMM HH:mm:ss')}</span>
                      <div>
                        <span>
                          {entry.skuCode && <span className="text-gray-400">[{entry.skuCode}] </span>}
                          {entry.fieldName} changed: <span className="font-medium">{entry.oldValue ?? '(empty)'}</span> → <span className="font-medium">{entry.newValue}</span>
                        </span>
                        {entry.sourceFileName && <p className="text-xs text-gray-400 mt-0.5">from {entry.sourceFileName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No changes recorded yet.</p>
              )}
            </div>
          )}

          {activeTab === 'source' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Source Traceability</h3>
              <p className="text-sm text-gray-600 mb-4">
                Source: <span className="font-medium">{source?.sourceType === 'BULK_IMPORT' ? 'Bulk Import' : 'Manually created'}</span>
              </p>
              {source?.sourceType === 'BULK_IMPORT' && (
                <>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Contributing Upload Batches</h4>
                  {source.batches.length === 0 ? (
                    <p className="text-gray-500 text-sm mb-4">No batch data found.</p>
                  ) : (
                    <div className="space-y-2 mb-6">
                      {source.batches.map((b: any) => (
                        <a key={b.id} href={`/bulk-import/${b.id}`} className="block border rounded p-3 hover:border-nootie-orange text-sm">
                          <span className="font-medium text-nootie-orange-dark">{b.batchCode}</span>
                          <span className="text-gray-500"> · {b.fileName} · {format(new Date(b.uploadedAt), 'dd MMM yyyy HH:mm')}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Contributing Rows ({source.contributingRows.length})</h4>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-right">Ordered</th>
                        <th className="px-3 py-2 text-right">Delivered</th>
                        <th className="px-3 py-2 text-left">Classification</th>
                        <th className="px-3 py-2 text-left">Imported</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {source.contributingRows.map((r: any) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">{r.skuCode}</td>
                          <td className="px-3 py-2 text-right">{r.orderedQty ?? '-'}</td>
                          <td className="px-3 py-2 text-right">{r.deliveredQty ?? '-'}</td>
                          <td className="px-3 py-2">{r.dedupClassification}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{format(new Date(r.createdAt), 'dd MMM HH:mm')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Audit Log</h3>
              {timeline?.auditLog?.length ? (
                <div className="space-y-2 text-sm">
                  {timeline.auditLog.map((entry: any) => (
                    <div key={entry.id} className="flex items-center gap-3 py-2 border-b">
                      <span className="text-xs text-gray-400 w-40 shrink-0">{format(new Date(entry.createdAt), 'dd MMM HH:mm:ss')}</span>
                      <span>
                        {entry.fieldName} changed: <span className="font-medium">{entry.oldValue}</span> → <span className="font-medium">{entry.newValue}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No changes recorded yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-2">Move PO to Bin?</p>
            <p className="text-sm text-gray-600 mb-6">
              This PO will be removed from active PO views but will remain recoverable in the Bin.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Moving...' : 'Move to Bin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {nfModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <p className="font-medium text-gray-800 mb-4">Why are you not fulfilling this PO?</p>
            {nfError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">{nfError}</div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">System Notes</p>
              <p className="text-sm text-gray-600">
                {nfDiagnosisLoading ? 'Checking PO status...' : nfDiagnosis || 'No automatic risk indicators found.'}
              </p>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Reason</label>
            <select
              value={nfReason}
              onChange={(e) => setNfReason(e.target.value as NonFulfilmentReason)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 bg-white"
            >
              <option value="">Select a reason...</option>
              {Object.values(NonFulfilmentReason).map((r) => (
                <option key={r} value={r}>
                  {NON_FULFILMENT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks {nfReason === NonFulfilmentReason.OTHER && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={nfRemarks}
              onChange={(e) => setNfRemarks(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-6"
              placeholder="Enter additional explanation..."
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setNfModalOpen(false);
                  setNfError('');
                  setNfDiagnosis('');
                }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkNotFulfilled}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

interface InfoBoxProps {
  label: string;
  value: string | React.ReactNode;
}

const InfoBox: React.FC<InfoBoxProps> = ({ label, value }) => (
  <div className="border rounded p-3">
    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-sm font-medium text-gray-800">{value}</p>
  </div>
);

const DISPATCH_STATUS_STYLES: Record<string, string> = {
  NOT_DUE: 'bg-green-100 text-green-700',
  DISPATCH_NOW: 'bg-yellow-100 text-yellow-700',
  DISPATCH_OVERDUE: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
  DISPATCHED: 'bg-gray-100 text-gray-600',
};

const DispatchStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span>-</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${DISPATCH_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const DocumentList: React.FC<{ label: string; documents: DocumentRecord[]; documentType: string }> = ({ label, documents, documentType }) => {
  const relevant = documents.filter((d) => d.documentType === documentType);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  return (
    <div className="mt-4 pt-4 border-t">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      {relevant.length === 0 ? (
        <p className="text-sm text-gray-400">No file uploaded.</p>
      ) : (
        <div className="space-y-1">
          {relevant.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setPreviewDoc(doc)}
              className="block text-sm text-nootie-orange-dark hover:underline"
            >
              {doc.fileName}
              <span className="text-gray-400 text-xs ml-2">
                {format(new Date(doc.uploadedAt), 'dd MMM yyyy HH:mm')}
              </span>
            </button>
          ))}
        </div>
      )}
      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
};
