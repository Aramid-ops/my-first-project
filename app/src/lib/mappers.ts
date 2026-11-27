// Բազայի տողերից → հավելվածի տիպեր (snake_case → camelCase)։
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Debt, DriverProfile, Employee, Firm, Issue, Line, Order, OrderStatus, Payment, Product, SavedList, Shop, ShopFirmLink, Team, TextOrder, Unit, Weekday } from './types';

const palette = [
  { bg: '#E2E8F4', fg: '#2C4A8A' },
  { bg: '#E3EEF0', fg: '#1D4E5A' },
  { bg: '#F3E9D8', fg: '#7A5214' },
  { bg: '#EFE3D6', fg: '#7A3E14' },
  { bg: '#E6EDE4', fg: '#2F5A2A' },
];
/** Ֆիրմայի մշտական գույնը (լոգո չունենալու դեպքում) */
export function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

const num = (v: any) => (v == null ? undefined : Number(v));

export const mapFirm = (r: any): Firm => ({
  id: r.id,
  name: r.name,
  category: r.category ?? '',
  logoUrl: r.logo_url ?? undefined,
  color: colorFor(r.id),
  baseLat: r.base_lat ?? undefined,
  baseLng: r.base_lng ?? undefined,
  featuredUntil: r.featured_until ?? undefined,
  minOrderAmount: num(r.min_order_amount),
  status: r.status ?? 'active',
  description: r.description ?? undefined,
  phone: r.phone ?? undefined,
  address: r.address ?? undefined,
  legalName: r.legal_name ?? undefined,
  taxId: r.tax_id ?? undefined,
});

export const mapEmployee = (r: any): Employee => ({
  id: r.id,
  firmId: r.firm_id,
  name: r.name,
  role: r.role,
  department: r.department ?? undefined,
  defaultForwardToId: r.default_forward_to ?? undefined,
  phone: r.phone ?? undefined,
});

export const mapShop = (r: any): Shop => ({
  id: r.id,
  name: r.name,
  taxId: r.tax_id,
  city: r.city,
  district: r.district ?? '',
  address: r.address ?? '',
  phone: r.phone ?? undefined,
  lat: r.lat ?? undefined,
  lng: r.lng ?? undefined,
  legalName: r.legal_name ?? undefined,
  email: r.email ?? undefined,
  contactPerson: r.contact_person ?? undefined,
});

export const mapLink = (r: any): ShopFirmLink => ({
  shopId: r.shop_id,
  firmId: r.firm_id,
  managerId: r.manager_id,
  status: r.status,
  deliveryDays: (r.delivery_days ?? []) as Weekday[],
  lineId: r.line_id ?? undefined,
  discountPct: Number(r.discount_pct ?? 0),
  creditLimit: num(r.credit_limit),
});

export const mapLine = (r: any): Line => ({
  id: r.id,
  firmId: r.firm_id,
  teamId: r.team_id ?? undefined,
  name: r.name,
  deliveryDays: (r.delivery_days ?? []) as Weekday[],
  driverId: r.driver_id ?? undefined,
  orderCutoff: r.order_cutoff ? String(r.order_cutoff).slice(0, 5) : undefined,
});

export const mapTeams = (teams: any[], members: any[]): Team[] =>
  teams.map((t) => ({
    id: t.id,
    firmId: t.firm_id,
    name: t.name,
    memberIds: members.filter((m) => m.team_id === t.id).map((m) => m.employee_id),
  }));

export const mapProduct = (r: any): Product => ({
  id: r.id,
  sku: r.sku ?? undefined,
  firmId: r.firm_id,
  name: r.name,
  imageUrl: r.image_url ?? undefined,
  unit: r.unit as Unit,
  packNote: r.pack_note ?? undefined,
  price: Number(r.price),
  minQty: Number(r.min_qty),
  step: Number(r.step),
  weighed: r.weighed,
  inStock: r.in_stock,
});

export const mapOrder = (r: any): Order => ({
  id: r.id,
  shopId: r.shop_id,
  firmId: r.firm_id,
  managerId: r.manager_id,
  assigneeId: r.assignee_id ?? r.manager_id,
  driverId: r.driver_id ?? undefined,
  invoiceNumber: r.invoice_number ?? undefined,
  status: r.status as OrderStatus,
  deliveryDate: r.delivery_date,
  createdAt: r.created_at,
  items: (r.order_items ?? []).map((i: any) => ({ productId: i.product_id, qty: Number(i.qty), actualQty: num(i.actual_qty) })),
  events: (r.order_events ?? [])
    .map((e: any) => ({ at: e.at, byName: e.actor_name, text: e.text, lat: e.lat ?? undefined, lng: e.lng ?? undefined }))
    .sort((a: any, b: any) => a.at.localeCompare(b.at)),
});

export const mapIssue = (r: any): Issue => ({
  id: r.id,
  orderId: r.order_id,
  productId: r.product_id ?? undefined,
  kind: r.kind,
  qty: num(r.qty),
  note: r.note ?? undefined,
  photoUrl: r.photo_url ?? undefined,
  createdAt: r.created_at,
});

export const mapDebt = (r: any): Debt => ({
  shopId: r.shop_id,
  firmId: r.firm_id,
  delivered: Number(r.delivered),
  paid: Number(r.paid),
  pending: Number(r.pending),
  debt: Number(r.debt),
});

export const mapPayment = (r: any): Payment => ({
  id: r.id,
  shopId: r.shop_id,
  firmId: r.firm_id,
  amount: Number(r.amount),
  confirmed: !!r.confirmed_at,
  markedAt: r.marked_paid_by_shop_at ?? undefined,
  note: r.note ?? undefined,
});

export const mapSavedList = (r: any): SavedList => ({
  id: r.id,
  name: r.name,
  items: (r.items ?? []).map((i: any) => ({ productId: i.product_id, qty: Number(i.qty) })),
});

export const mapDriverProfile = (r: any): DriverProfile => ({
  name: r.name,
  phone: r.phone ?? undefined,
  address: r.address ?? undefined,
  licenseCategories: r.license_categories ?? [],
  vehicleType: r.vehicle_type ?? undefined,
  vehicleModel: r.vehicle_model ?? undefined,
  plate: r.plate ?? undefined,
  capacityKg: num(r.capacity_kg),
  refrigerated: !!r.refrigerated,
  verificationStatus: r.verification_status ?? 'none',
  verificationNote: r.verification_note ?? undefined,
});

export const mapTextOrder = (r: any): TextOrder => ({
  id: r.id,
  shopId: r.shop_id,
  firmId: r.firm_id,
  managerId: r.manager_id ?? undefined,
  text: r.text,
  status: r.status,
  createdAt: r.created_at,
});
