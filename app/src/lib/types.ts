// Տվյալների մոդել՝ ըստ docs/SPEC.md (§2–§7)։ Նույն կառուցվածքն է supabase/migrations-ում։

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = երկուշաբթի

export interface Firm {
  id: string;
  name: string;
  /** Լոգո չլինելու դեպքում՝ գունավոր տառ */
  logoUrl?: string;
  color: { bg: string; fg: string };
  category: string;
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
}

/** Խանութի կապը ֆիրմայի հետ. ճիշտ մեկ մենեջեր (§2, կանոն 2) */
export interface ShopFirmLink {
  shopId: string;
  firmId: string;
  managerId: string;
  status: 'pending' | 'active' | 'paused';
  /** Գծի օրեր այս խանութի համար; դատարկ = ամեն օր */
  deliveryDays: Weekday[];
}

export type Unit = 'հատ' | 'կգ' | 'գ' | 'լ' | 'մ' | 'տուփ' | 'բլոկ' | 'արկղ';

export interface Product {
  id: string;
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
}

export interface Order {
  id: string;
  shopId: string;
  firmId: string;
  managerId: string;
  /** Ներսում ում մոտ է հիմա */
  assigneeId: string;
  driverId?: string;
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
