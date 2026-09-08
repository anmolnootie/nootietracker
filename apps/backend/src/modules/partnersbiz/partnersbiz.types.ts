/** Shapes lifted directly from the Partnersbiz EDI docs (Purchase Order Creation Sync payload). */

export interface PartnersbizAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface PartnersbizContact {
  name?: string;
  email?: string;
  phone?: string;
}

export interface PartnersbizItem {
  item_id?: number | string;
  line_number?: number;
  sku_code?: string;
  name?: string;
  upc?: string;
  mrp?: number;
  basic_price?: number;
  landing_price?: number;
  units_ordered?: number;
  uom?: { unit?: string; value?: number };
  crates_config?: { crate_size?: number; crates_ordered?: number };
  tax_details?: Record<string, number>;
}

export interface PartnersbizPODetails {
  po_number: string;
  issue_date?: string;
  expiry_date?: string;
  delivery_date?: string;
  outlet_id?: number | string;
  total_amount?: number;
  total_qty?: number;
  total_sku?: number;
  buyer_details?: {
    name?: string;
    gstin?: string;
    contact_details?: PartnersbizContact[];
    destination_address?: PartnersbizAddress;
    registered_address?: PartnersbizAddress;
  };
  supplier_details?: {
    id?: string;
    name?: string;
    gstin?: string;
    pan?: string;
    contact_details?: PartnersbizContact[];
    registered_address?: PartnersbizAddress;
    shipping_address?: PartnersbizAddress;
  };
  item_data?: PartnersbizItem[];
  custom_attributes?: { name: string; value: string }[];
}

export interface PartnersbizPOCreationPayload {
  po_number: string;
  tenant: string;
  type: 'PO_CREATION';
  details: PartnersbizPODetails;
}

export interface PartnersbizWarning {
  code: string;
  message: string;
  description?: string;
}

export interface PartnersbizAckResponse {
  success: boolean;
  message: string;
  timestamp: string;
  data: {
    po_number: string;
    po_status: string;
    warnings: PartnersbizWarning[];
  };
}
