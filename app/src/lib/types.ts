// Տվյալների մոդել՝ ըստ docs/SPEC.md (§2–§7)։ Նույն կառուցվածքն է supabase/migrations-ում։

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = երկուշաբթի

export interface Firm {
  id: string;
  name: string;
  /** Լոգո չլինելու դեպքում՝ գունավոր տառ */
  logoUrl?: string;
  color: { bg: string; fg: string };
  category: string;
  /** Ֆիրմայի բազա (պահեստ)՝ կանգառները մոտիկից հեռու շարելու համար */
  baseLat?: number;
  baseLng?: number;
  /** Վճարովի «առաջարկվող» տեղը՝ մինչև այս օրը */
  featuredUntil?: string;
  minOrderAmount?: number;
  /** 'unclaimed' = ֆիրման ինքը դեռ չի գրանցվել, աշխատում են նրա մենեջերները */
  status?: 'active' | 'unclaimed';
  /** Մեր մասին (կարճ), կոնտակտ և իրավաբանական տվյալներ՝ «Բոլոր մատակարարները» էջի համար */
  description?: string;
  phone?: string;
  address?: string;
  legalName?: string;
  taxId?: string;
}

export type EmployeeRole = 'admin' | 'manager' | 'staff' | 'driver';

export interface Employee {
  id: string;
  firmId: string;
  name: string;
  role: EmployeeRole;
  /** Ազատ անվանում, որ ֆիրման ինքն է դնում («Առաքման բաժին», «Պահեստ») */
  department?: string;
  /** Մենեջերի համար՝ ում է լռելյայն փոխանցում պատվերները */
  defaultForwardToId?: string;
  phone?: string;
  /** Մենեջերի թաղամասերը (խանութները այնտեղից գալիս են նրան) */
  districts?: string[];
}

export interface Shop {
  id: string;
  name: string;
  taxId: string; // ՀՎՀՀ
  city: string;
  district: string;
  address: string;
  phone?: string;
  lat?: number;
  lng?: number;
  legalName?: string;
  email?: string;
  contactPerson?: string;
  /** Երևա՞լ «Բոլոր խանութները» ցուցակում (մատակարարներին) */
  listed?: boolean;
}

/** Խանութի կապը ֆիրմայի հետ. ճիշտ մեկ մենեջեր (§2, կանոն 2) */
export interface ShopFirmLink {
  shopId: string;
  firmId: string;
  managerId: string;
  status: 'pending' | 'active' | 'paused';
  /** Գծի օրեր այս խանութի համար; դատարկ = ամեն օր (եթե կա գիծ՝ վերցվում է գծից) */
  deliveryDays: Weekday[];
  lineId?: string;
  discountPct?: number;
  creditLimit?: number;
}

export interface DriverProfile {
  name: string;
  phone?: string;
  address?: string;
  licenseCategories: string[];
  vehicleType?: string;
  vehicleModel?: string;
  plate?: string;
  capacityKg?: number;
  refrigerated: boolean;
  verificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  verificationNote?: string;
}

export interface SavedList {
  id: string;
  name: string;
  items: { productId: string; qty: number }[];
}

/** Ֆիրմայի աշխատողների խումբ. մեկ աշխատող կարող է լինել մի քանիսում */
export interface Team {
  id: string;
  firmId: string;
  name: string;
  memberIds: string[];
}

/** Գիծ. անուն + օրեր + մշտական վարորդ */
export interface Line {
  id: string;
  firmId: string;
  teamId?: string;
  name: string;
  deliveryDays: Weekday[];
  driverId?: string;
  /** «HH:MM». դրանից հետո պատվերը գնում է հաջորդ գծին */
  orderCutoff?: string;
}

export type IssueKind = 'broken' | 'missing' | 'wrong' | 'expired';
export const issueLabel: Record<IssueKind, string> = { broken: 'Ջարդված', missing: 'Պակաս', wrong: 'Սխալ ապրանք', expired: 'Ժամկետանց' };

export interface Issue {
  id: string;
  orderId: string;
  productId?: string;
  kind: IssueKind;
  qty?: number;
  note?: string;
  photoUrl?: string;
  createdAt: string;
}

export interface Debt {
  shopId: string;
  firmId: string;
  delivered: number;
  paid: number;
  pending: number;
  debt: number;
}

export interface Payment {
  id: string;
  shopId: string;
  firmId: string;
  amount: number;
  confirmed: boolean;
  markedAt?: string;
  note?: string;
}

export type Unit = 'հատ' | 'կգ' | 'գ' | 'լ' | 'մլ' | 'մ' | 'տուփ' | 'բլոկ' | 'արկղ';
export const units: Unit[] = ['հատ', 'կգ', 'գ', 'լ', 'մլ', 'մ', 'տուփ', 'բլոկ', 'արկղ'];

export interface Product {
  id: string;
  /** Արտիկուլ, օր.՝ AT0012 */
  sku?: string;
  firmId: string;
  name: string;
  imageUrl?: string;
  unit: Unit;
  /** Օր.՝ «1 բլոկ = 30 հատ» */
  packNote?: string;
  /** Գինը մեկ `unit`-ի համար, դրամ */
  price: number;
  minQty: number;
  step: number;
  /** Կշռվող ապրանք. պատվիրվում է մոտավոր քանակ, իրականը գրվում է կշռելուց հետո */
  weighed?: boolean;
  inStock: boolean;
}

export type OrderStatus =
  | 'sent' // խանութը ուղարկեց մենեջերին
  | 'accepted' // մենեջերը ընդունեց
  | 'preparing' // փոխանցվել է ներս (օֆիս, պահեստ...)
  | 'on_the_way' // վարորդը մեկնեց
  | 'delivered' // առաքված
  | 'returned'; // մենեջերը վերադարձրեց

export interface OrderItem {
  productId: string;
  qty: number;
  /** Կշռվող ապրանքի իրական քանակը */
  actualQty?: number;
}

export interface OrderEvent {
  at: string; // ISO
  byName: string;
  text: string;
  lat?: number;
  lng?: number;
}

/** Տեքստային (թելադրված) պատվեր. խանութը գրում է ազատ տեքստով, մենեջերը ստեղծում է իսկական պատվերը */
export interface TextOrder {
  id: string;
  shopId: string;
  firmId: string;
  managerId?: string;
  text: string;
  status: 'new' | 'done';
  createdAt: string;
}

export interface Order {
  id: string;
  shopId: string;
  firmId: string;
  managerId: string;
  /** Ներսում ում մոտ է հիմա */
  assigneeId: string;
  driverId?: string;
  invoiceNumber?: string;
  status: OrderStatus;
  deliveryDate: string; // YYYY-MM-DD
  items: OrderItem[];
  events: OrderEvent[];
  createdAt: string;
}

/** Խանութի պարզ կարգավիճակները (§5 «Ինչ է տեսնում խանութը») */
export const shopStatusLabel: Record<OrderStatus, string> = {
  sent: 'Ուղարկված',
  accepted: 'Մենեջերը ընդունեց',
  preparing: 'Պատրաստվում է',
  on_the_way: 'Ճանապարհին է',
  delivered: 'Առաքված',
  returned: 'Վերադարձված',
};
